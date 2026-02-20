const http = require("http");
const crypto = require("crypto");
const { loadConfig } = require("./config");
const { verifyJwt } = require("../../../scripts/auth/jwt");
const { assertDatabaseReady } = require("../../../scripts/db/runtime");
const {
  ensureReady,
  ensureUser,
  getJobById,
  getJobByIdempotencyKey,
  listRerunJobsByParentJobId,
  getApprovalPolicy,
  upsertApprovalPolicy,
  getLatestAnalysisRunByJobId,
  getImageTraitAnalysisByJobId,
  getStyleInfluenceById,
  updateStyleInfluenceGovernance,
  insertAdminActionAudit,
  listAdminActionsAuditByTarget,
  insertJob,
  updateJobStatus,
  updateJobModerationStatus,
  getRecommendationExtractionById,
  insertRecommendationExtraction,
  markRecommendationExtractionConfirmed,
  ensurePromptByText,
  ensureRecommendationSession,
  getRecommendationSessionById,
  getPromptById,
  updatePromptCurationStatus,
  listRecommendationsBySessionId,
  insertRecommendation,
  getRecommendationCountBySessionId,
  getRecommendationById,
  insertGeneratedImage,
  getGeneratedImageById,
  insertPostResultFeedback,
  getPostResultFeedbackById,
  listPostResultFeedbackBySessionId,
  insertAlignmentEvaluation,
  getAlignmentEvaluationByFeedbackId,
  listActiveStyleInfluenceCombinations,
  updateRecommendationSessionStatus,
} = require("../../../scripts/db/repository");
const { createQueueAdapter } = require("../../../scripts/queue/adapter");
const { createStorageAdapter } = require("../../../packages/storage-adapter/src");
const { normalizeMidjourneyMetadata } = require("../../../scripts/ingestion/midjourney-metadata");
const {
  resolveModelSelection,
  setCurrentDefaultModels,
} = require("../../../scripts/models/model-versioning");
const {
  CONTRACT_VERSION,
  validateRecommendationSubmitPayload,
  validateRecommendationExtractionPayload,
  validateRecommendationExtractionConfirmPayload,
  validateGeneratedImageUploadPayload,
  validateFeedbackEvaluationPayload,
  validateStyleInfluenceGovernancePayload,
  validateAnalysisModerationPayload,
  validatePromptCurationPayload,
  validateApprovalPolicyPayload,
  validateAnalysisApprovalPayload,
  validateAnalysisJobEnvelope,
  createApiErrorResponse,
} = require("../../../packages/shared-contracts/src");

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function createRequestContext(req, config) {
  const existingRequestId = req.headers["x-request-id"];
  const requestId = typeof existingRequestId === "string" && existingRequestId.trim() !== ""
    ? existingRequestId.trim()
    : crypto.randomUUID();

  return {
    requestId,
    service: config.observability.serviceName,
  };
}

function resolveAuthenticatedUserId(authClaims) {
  const candidate = authClaims?.sub || authClaims?.username || authClaims?.client_id;
  if (typeof candidate === "string" && candidate.trim() !== "") {
    return candidate.trim();
  }
  throw new Error("JWT payload missing subject identifier");
}

function confidenceThresholdForMode(mode) {
  return mode === "precision" ? 0.65 : 0.45;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function tokenize(value) {
  return String(value || "")
    .toLowerCase()
    .split(/[^a-z0-9_-]+/)
    .filter((token) => token.length >= 3);
}

function scoreCandidate({ extraction, promptText, mode, candidate }) {
  const totalItems = Number(candidate.total_items || 0);
  const profileItems = Number(candidate.profile_items || 0);
  const srefItems = Number(candidate.sref_items || 0);
  const pinnedItems = Number(candidate.pinned_items || 0);

  const profileFit = extraction.has_profile
    ? (profileItems > 0 ? 1 : 0)
    : (profileItems === 0 ? 1 : 0.4);
  const srefFit = extraction.has_sref
    ? (srefItems > 0 ? 1 : 0)
    : (srefItems === 0 ? 1 : 0.4);

  const targetItems = (extraction.has_profile ? 1 : 0) + (extraction.has_sref ? 1 : 0);
  const distance = Math.abs(totalItems - targetItems);
  const sizeFit = clamp(1 - (distance / 3), 0, 1);

  const promptTerms = new Set(tokenize(promptText));
  const candidateTerms = new Set(tokenize(`${candidate.name || ""} ${candidate.influence_codes || ""}`));
  let overlapCount = 0;
  for (const token of promptTerms) {
    if (candidateTerms.has(token)) {
      overlapCount += 1;
    }
  }
  const overlapFit = promptTerms.size > 0
    ? clamp(overlapCount / promptTerms.size, 0, 1)
    : 0;

  const pinnedFit = clamp(pinnedItems / 2, 0, 1);
  const sizeWeight = mode === "precision" ? 0.2 : 0.12;

  const score = (
    0.12
    + (0.24 * profileFit)
    + (0.24 * srefFit)
    + (sizeWeight * sizeFit)
    + (0.15 * overlapFit)
    + (0.05 * pinnedFit)
  );

  return {
    ...candidate,
    score: clamp(score, 0, 1),
    scoreBreakdown: {
      profileFit: Number(profileFit.toFixed(3)),
      srefFit: Number(srefFit.toFixed(3)),
      sizeFit: Number(sizeFit.toFixed(3)),
      overlapFit: Number(overlapFit.toFixed(3)),
      pinnedFit: Number(pinnedFit.toFixed(3)),
    },
  };
}

function rankCandidatesForSession(extraction, mode, candidates) {
  const threshold = confidenceThresholdForMode(mode);
  const scored = candidates
    .map((candidate) => scoreCandidate({
      extraction,
      promptText: extraction.prompt_text,
      mode,
      candidate,
    }))
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return String(a.combination_id).localeCompare(String(b.combination_id));
    });

  const aboveThreshold = scored
    .filter((candidate) => candidate.score >= threshold)
    .slice(0, 3);
  if (aboveThreshold.length > 0) {
    return aboveThreshold;
  }

  // Preserve explicit low-confidence behavior when no candidate clears threshold.
  return scored.slice(0, 1);
}

function buildRecommendationPayloads(promptText, mode, rankedCandidates) {
  const threshold = confidenceThresholdForMode(mode);
  return rankedCandidates.map((candidate, index) => {
    const roundedConfidence = Number(candidate.score.toFixed(3));
    const isLowConfidence = roundedConfidence < threshold;
    const modeLabel = mode === "precision" ? "Precision" : "Close enough";
    const influenceText = String(candidate.influence_codes || "").trim();

    return {
      rank: index + 1,
      combinationId: candidate.combination_id,
      confidence: roundedConfidence,
      rationale: `${modeLabel} match for extracted prompt using combination ${candidate.combination_id}.`,
      riskNotes: isLowConfidence
        ? [`Confidence ${roundedConfidence} is below ${modeLabel.toLowerCase()} threshold ${threshold}.`]
        : [],
      promptImprovements: influenceText
        ? [`Try emphasizing style hints aligned with: ${influenceText}.`]
        : ["Try adding concrete mood and composition constraints."],
      lowConfidence: isLowConfidence
        ? {
          isLowConfidence: true,
          reasonCode: "below_mode_threshold",
          threshold,
        }
        : {
          isLowConfidence: false,
        },
    };
  });
}

function buildRationaleFromBreakdown(mode, candidate, breakdown) {
  const modeLabel = mode === "precision" ? "Precision" : "Close enough";
  const parts = [];

  if (breakdown.profileFit >= 0.9) {
    parts.push("profile usage aligns with extracted prompt signals");
  } else if (breakdown.profileFit <= 0.5) {
    parts.push("profile usage only partially aligns with extracted prompt signals");
  }

  if (breakdown.srefFit >= 0.9) {
    parts.push("sref usage aligns with extracted prompt signals");
  } else if (breakdown.srefFit <= 0.5) {
    parts.push("sref usage is a weaker fit for extracted prompt signals");
  }

  if (breakdown.overlapFit >= 0.25) {
    parts.push("candidate descriptors overlap with prompt wording");
  } else {
    parts.push("limited descriptor overlap with prompt wording");
  }

  if (breakdown.sizeFit >= 0.75) {
    parts.push("combination size matches extracted control complexity");
  } else {
    parts.push("combination size differs from extracted control complexity");
  }

  return `${modeLabel} match for ${candidate.combination_id}: ${parts.join("; ")}.`;
}

function buildRiskNotesFromBreakdown(mode, candidate, breakdown, confidence, threshold) {
  const riskNotes = [];
  if (confidence < threshold) {
    riskNotes.push(`Confidence ${confidence} is below ${mode} threshold ${threshold}.`);
  }
  if (breakdown.overlapFit < 0.2) {
    riskNotes.push("Prompt wording has low overlap with candidate descriptors.");
  }
  if (breakdown.sizeFit < 0.5) {
    riskNotes.push("Candidate uses a control-count pattern that differs from extracted prompt controls.");
  }
  if (breakdown.profileFit < 0.8 && breakdown.srefFit < 0.8) {
    riskNotes.push("Both profile and sref fit signals are weaker than preferred.");
  }
  return riskNotes;
}

function buildPromptImprovementsFromBreakdown(candidate, breakdown) {
  const improvements = [];
  const influenceText = String(candidate.influence_codes || "").trim();
  if (influenceText) {
    improvements.push(`Add explicit style anchors similar to: ${influenceText}.`);
  }
  if (breakdown.overlapFit < 0.25) {
    improvements.push("Use concrete visual descriptors (lighting, lens, mood, composition) to improve style matching.");
  }
  if (breakdown.profileFit < 0.8) {
    improvements.push("If profile behavior matters, include clearer profile-oriented language in the prompt.");
  }
  if (breakdown.srefFit < 0.8) {
    improvements.push("If style-reference behavior matters, add stronger style-reference cues in the prompt.");
  }
  if (improvements.length === 0) {
    improvements.push("Keep prompt structure stable and refine one visual attribute at a time.");
  }
  return improvements.slice(0, 3);
}

function enrichRecommendationExplanations(mode, rankedCandidates, basePayloads) {
  return basePayloads.map((payload, index) => {
    const candidate = rankedCandidates[index];
    const breakdown = candidate.scoreBreakdown;
    const threshold = confidenceThresholdForMode(mode);
    const confidence = payload.confidence;
    const rationale = buildRationaleFromBreakdown(mode, candidate, breakdown);
    const riskNotes = buildRiskNotesFromBreakdown(mode, candidate, breakdown, confidence, threshold);
    const promptImprovements = buildPromptImprovementsFromBreakdown(candidate, breakdown);
    const isLowConfidence = confidence < threshold;
    const lowConfidence = isLowConfidence
      ? {
        isLowConfidence: true,
        reasonCode: "below_mode_threshold",
        threshold,
      }
      : {
        isLowConfidence: false,
      };

    return {
      ...payload,
      rationale,
      riskNotes,
      promptImprovements,
      confidenceRisk: {
        confidence,
        riskNotes,
        lowConfidence,
      },
      lowConfidence,
    };
  });
}

function assertRecommendationExplanationPayload(payload) {
  if (typeof payload.rationale !== "string" || payload.rationale.trim() === "") {
    throw new Error("Recommendation explanation missing rationale");
  }
  if (!Array.isArray(payload.riskNotes) || !payload.riskNotes.every((value) => typeof value === "string")) {
    throw new Error("Recommendation explanation missing riskNotes[]");
  }
  if (!Array.isArray(payload.promptImprovements)
    || payload.promptImprovements.length === 0
    || !payload.promptImprovements.every((value) => typeof value === "string" && value.trim() !== "")) {
    throw new Error("Recommendation explanation missing promptImprovements[]");
  }
}

function logJson(level, message, fields) {
  console.log(
    JSON.stringify({
      level,
      message,
      timestamp: new Date().toISOString(),
      ...fields,
    })
  );
}

function extensionForMimeType(mimeType) {
  if (mimeType === "image/png") {
    return "png";
  }
  if (mimeType === "image/jpeg") {
    return "jpg";
  }
  if (mimeType === "image/webp") {
    return "webp";
  }
  return "bin";
}

function emojiToScore(emojiRating) {
  if (emojiRating === "🙂") {
    return 1;
  }
  if (emojiRating === "☹️") {
    return -1;
  }
  return null;
}

function usefulToScore(usefulFlag) {
  if (usefulFlag === true) {
    return 1;
  }
  if (usefulFlag === false) {
    return -1;
  }
  return null;
}

function computeEvidenceStrength(input) {
  const hasImage = typeof input.generatedImageId === "string" && input.generatedImageId.trim() !== "";
  const hasEmoji = typeof input.emojiRating === "string" && input.emojiRating.trim() !== "";
  if (hasImage && hasEmoji) {
    return "normal";
  }
  if (hasEmoji) {
    return "minor";
  }
  if (hasImage) {
    return "normal";
  }
  return "minor";
}

function evaluateFeedbackAlignment(input) {
  const signals = [];
  const emojiSignal = emojiToScore(input.emojiRating);
  if (emojiSignal !== null) {
    signals.push(emojiSignal);
  }
  const usefulSignal = usefulToScore(input.usefulFlag);
  if (usefulSignal !== null) {
    signals.push(usefulSignal);
  }
  const sentiment = signals.length === 0
    ? 0
    : (signals.reduce((sum, value) => sum + value, 0) / signals.length);

  const evidenceStrength = computeEvidenceStrength(input);
  const baseImpact = evidenceStrength === "normal" ? 0.12 : 0.03;
  const confidenceDelta = Number(clamp(sentiment * baseImpact, -0.25, 0.25).toFixed(3));

  const hasImage = typeof input.generatedImageId === "string" && input.generatedImageId.trim() !== "";
  const baseline = hasImage ? 0.64 : 0.52;
  const alignmentScore = Number(clamp(baseline + (confidenceDelta * 1.8), 0, 1).toFixed(3));

  let mismatchSummary = "Result aligns with expected visual intent.";
  if (confidenceDelta < 0) {
    mismatchSummary = hasImage
      ? "Observed output diverges from expected composition/tone in the provided image."
      : "Feedback indicates mismatch risk, but confidence impact remains minor without image evidence.";
  } else if (confidenceDelta === 0) {
    mismatchSummary = hasImage
      ? "Partial alignment; keep current direction and refine one control at a time."
      : "Neutral feedback signal; additional evidentiary image would improve alignment confidence.";
  }

  const suggestedPromptAdjustments = confidenceDelta < 0
    ? [
      "Add explicit lighting and composition constraints in the prompt.",
      "Reduce ambiguity by specifying subject priority and mood directly.",
    ]
    : [
      "Keep current prompt structure and iterate with one targeted modifier.",
    ];

  return {
    evidenceStrength,
    alignmentScore,
    confidenceDelta,
    mismatchSummary,
    suggestedPromptAdjustments,
  };
}

function mapFeedbackRow(row) {
  return {
    feedbackId: row.feedback_id,
    recommendationSessionId: row.recommendation_session_id,
    recommendationId: row.recommendation_id,
    generatedImageId: row.generated_image_id,
    emojiRating: row.emoji_rating,
    usefulFlag: row.useful_flag === null ? null : Boolean(row.useful_flag),
    comments: row.comments,
    evidenceStrength: row.evidence_strength,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAlignmentRow(row) {
  if (!row) {
    return null;
  }
  return {
    alignmentEvaluationId: row.alignment_evaluation_id,
    feedbackId: row.feedback_id,
    alignmentScore: row.alignment_score,
    mismatchSummary: row.mismatch_summary,
    suggestedPromptAdjustments: JSON.parse(row.suggested_prompt_adjustments_json || "[]"),
    alternativeCombinationIds: JSON.parse(row.alternative_combination_ids_json || "[]"),
    confidenceDelta: row.confidence_delta,
    createdAt: row.created_at,
  };
}

function mapAnalysisRunRow(row) {
  if (!row) {
    return null;
  }
  return {
    analysisRunId: row.analysis_run_id,
    jobId: row.job_id,
    status: row.status,
    attemptCount: Number(row.attempt_count || 0),
    startedAt: row.started_at,
    completedAt: row.completed_at,
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
    modelFamily: row.model_family,
    modelVersion: row.model_version,
  };
}

function mapAnalysisJobRow(row) {
  if (!row) {
    return null;
  }
  return {
    jobId: row.job_id,
    status: row.status,
    moderationStatus: row.moderation_status || "none",
    rerunOfJobId: row.rerun_of_job_id || null,
    runType: row.run_type,
    imageId: row.image_id,
    idempotencyKey: row.idempotency_key,
    submittedAt: row.submitted_at,
    modelFamily: row.model_family,
    modelVersion: row.model_version,
    modelSelectionSource: row.model_selection_source,
  };
}

function mapImageTraitAnalysisRow(row) {
  if (!row) {
    return null;
  }
  return {
    imageTraitAnalysisId: row.image_trait_analysis_id,
    analysisRunId: row.analysis_run_id,
    jobId: row.job_id,
    imageId: row.image_id,
    traitSchemaVersion: row.trait_schema_version,
    traitVector: JSON.parse(row.trait_vector_json || "{}"),
    evidenceSummary: row.evidence_summary,
    createdAt: row.created_at,
  };
}

function mapAdminAuditRow(row) {
  return {
    adminActionAuditId: row.admin_action_audit_id,
    adminUserId: row.admin_user_id,
    actionType: row.action_type,
    targetType: row.target_type,
    targetId: row.target_id,
    reason: row.reason,
    createdAt: row.created_at,
  };
}

function mapApprovalPolicyRow(row) {
  if (!row) {
    return null;
  }
  return {
    policyScope: row.policy_scope,
    approvalMode: row.approval_mode,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createStoredJobEnvelope(job) {
  return validateAnalysisJobEnvelope({
    schemaVersion: CONTRACT_VERSION,
    jobId: job.job_id,
    idempotencyKey: job.idempotency_key,
    runType: job.run_type,
    imageId: job.image_id,
    submittedAt: job.submitted_at || new Date().toISOString(),
    priority: "normal",
    context: {
      approvalSource: "manual_policy",
    },
    modelFamily: job.model_family,
    modelVersion: job.model_version,
    modelSelectionSource: job.model_selection_source,
  });
}

const SUPPRESSED_ANALYSIS_MODERATION_STATUSES = new Set(["flagged", "removed"]);

function requireAdminUser(dbPath, userId) {
  const user = ensureUser(dbPath, {
    userId,
    role: "consumer",
    status: "active",
  });
  return user && user.role === "admin" && user.status === "active";
}

function invalidateRecommendationCaches() {
  // Placeholder hook for future in-process cache invalidation.
  return { invalidated: false, strategy: "no_cache_layer_present" };
}

function sendJson(res, statusCode, payload, ctx) {
  res.writeHead(statusCode, {
    "content-type": "application/json",
    "x-request-id": ctx.requestId,
  });
  res.end(JSON.stringify(payload));
}

function sendError(res, statusCode, code, message, ctx, details) {
  const payload = createApiErrorResponse({
    code,
    message,
    requestId: ctx.requestId,
    details: details || null,
  });
  sendJson(res, statusCode, payload, ctx);
}

function createJobEnvelope(submitBody) {
  const promptText = typeof submitBody.prompt === "string"
    ? submitBody.prompt
    : (typeof submitBody.context?.promptText === "string"
      ? submitBody.context.promptText
      : (typeof submitBody.context?.prompt === "string" ? submitBody.context.prompt : ""));

  const modelSelection = resolveModelSelection({ promptText });
  const envelope = {
    schemaVersion: CONTRACT_VERSION,
    jobId: crypto.randomUUID(),
    idempotencyKey: submitBody.idempotencyKey,
    runType: submitBody.runType,
    imageId: submitBody.imageId,
    submittedAt: new Date().toISOString(),
    priority: submitBody.priority || "normal",
    context: submitBody.context || {},
    modelFamily: modelSelection.modelFamily,
    modelVersion: modelSelection.modelVersion,
    modelSelectionSource: modelSelection.modelSelectionSource,
  };

  return validateAnalysisJobEnvelope(envelope);
}

async function requestHandler(req, res, config, dbPath, queueAdapter, storageAdapter) {
  const ctx = createRequestContext(req, config);
  const url = new URL(req.url, "http://localhost");
  const method = req.method || "GET";
  const path = url.pathname;

  logJson("info", "api.request", {
    request_id: ctx.requestId,
    method,
    path,
    service: ctx.service,
  });

  if (method === "GET" && path === "/v1/health") {
    sendJson(
      res,
      200,
      {
        status: "ok",
        appEnv: config.runtime.appEnv,
        contractVersion: CONTRACT_VERSION,
      },
      ctx
    );
    return;
  }

  let authClaims;
  try {
    authClaims = await verifyJwt(req.headers.authorization, config);
  } catch (error) {
    sendError(res, 401, "UNAUTHORIZED", "Invalid authorization token", ctx, {
      reason: error.message,
    });
    return;
  }

  let authenticatedUserId;
  try {
    authenticatedUserId = resolveAuthenticatedUserId(authClaims);
  } catch (error) {
    sendError(res, 401, "UNAUTHORIZED", "Invalid authorization token", ctx, {
      reason: error.message,
    });
    return;
  }

  if (method === "POST" && path === "/v1/recommendation-extractions") {
    try {
      const body = await parseJsonBody(req);
      const payload = validateRecommendationExtractionPayload(body);
      const normalized = normalizeMidjourneyMetadata(payload);
      const extractionId = `rex_${crypto.randomUUID()}`;

      insertRecommendationExtraction(dbPath, {
        extractionId,
        status: "extracted",
        promptText: normalized.prompt,
        author: normalized.author,
        creationTime: normalized.creationTime,
        sourceJobId: normalized.jobId,
        modelFamily: normalized.modelFamily,
        modelVersion: normalized.modelVersion,
        modelSelectionSource: normalized.modelSelectionSource,
        isBaseline: normalized.isBaseline,
        hasProfile: normalized.hasProfile,
        hasSref: normalized.hasSref,
        parserVersion: normalized.parserVersion,
        metadataRaw: normalized.metadataRaw,
      });

      sendJson(
        res,
        201,
        {
          extraction: {
            extractionId,
            status: "extracted",
            prompt: normalized.prompt,
            author: normalized.author,
            creationTime: normalized.creationTime,
            sourceJobId: normalized.jobId,
            modelFamily: normalized.modelFamily,
            modelVersion: normalized.modelVersion,
            modelSelectionSource: normalized.modelSelectionSource,
            isBaseline: normalized.isBaseline,
            hasProfile: normalized.hasProfile,
            hasSref: normalized.hasSref,
            parserVersion: normalized.parserVersion,
          },
          requiresConfirmation: true,
        },
        ctx
      );
      return;
    } catch (error) {
      sendError(res, 400, "INVALID_REQUEST", "Extraction parsing failed", ctx, {
        reason: error.message,
      });
      return;
    }
  }

  if (method === "POST" && path.startsWith("/v1/recommendation-extractions/") && path.endsWith("/confirm")) {
    const extractionId = path.slice("/v1/recommendation-extractions/".length, -"/confirm".length);
    const extraction = getRecommendationExtractionById(dbPath, extractionId);

    if (!extraction) {
      sendError(res, 404, "NOT_FOUND", "Recommendation extraction not found", ctx);
      return;
    }

    try {
      const body = await parseJsonBody(req);
      validateRecommendationExtractionConfirmPayload(body);
      const submitPayload = validateRecommendationSubmitPayload({
        extractionId,
        mode: body.mode,
        confirmed: body.confirmed,
      });
      const confirmedAt = markRecommendationExtractionConfirmed(dbPath, extractionId);
      const prompt = ensurePromptByText(dbPath, {
        promptId: `prm_${crypto.randomUUID()}`,
        promptText: extraction.prompt_text,
        createdBy: authenticatedUserId,
      });
      const session = ensureRecommendationSession(dbPath, {
        sessionId: `rs_${crypto.randomUUID()}`,
        userId: authenticatedUserId,
        mode: submitPayload.mode,
        extractionId: submitPayload.extractionId,
        promptId: prompt.prompt_id,
        status: "confirmed",
      });
      const existingRecommendationCount = getRecommendationCountBySessionId(dbPath, session.session_id);
      if (existingRecommendationCount === 0) {
        const candidates = listActiveStyleInfluenceCombinations(dbPath);
        const rankedCandidates = rankCandidatesForSession(
          extraction,
          session.mode,
          candidates
        );

        if (rankedCandidates.length === 0) {
          updateRecommendationSessionStatus(dbPath, session.session_id, "failed");
        } else {
          const recommendationPayloads = buildRecommendationPayloads(
            extraction.prompt_text,
            session.mode,
            rankedCandidates
          );
          const enrichedRecommendationPayloads = enrichRecommendationExplanations(
            session.mode,
            rankedCandidates,
            recommendationPayloads
          );
          for (const payload of enrichedRecommendationPayloads) {
            assertRecommendationExplanationPayload(payload);
          }
          for (const payload of enrichedRecommendationPayloads) {
            insertRecommendation(dbPath, {
              recommendationId: `rec_${crypto.randomUUID()}`,
              recommendationSessionId: session.session_id,
              rank: payload.rank,
              combinationId: payload.combinationId,
              rationale: payload.rationale,
              confidence: payload.confidence,
              riskNotes: payload.riskNotes,
              promptImprovements: payload.promptImprovements,
            });
          }
          updateRecommendationSessionStatus(dbPath, session.session_id, "succeeded");
        }
      }
      const latestSession = getRecommendationSessionById(dbPath, session.session_id);
      sendJson(
        res,
        200,
        {
          session: {
            sessionId: latestSession.session_id,
            extractionId: latestSession.extraction_id,
            promptId: latestSession.prompt_id,
            userId: latestSession.user_id,
            mode: latestSession.mode,
            status: latestSession.status,
            createdAt: latestSession.created_at,
            updatedAt: latestSession.updated_at,
            confirmedAt,
          },
        },
        ctx
      );
      return;
    } catch (error) {
      sendError(res, 400, "INVALID_REQUEST", "Confirmation failed validation", ctx, {
        reason: error.message,
      });
      return;
    }
  }

  if (method === "GET" && path.startsWith("/v1/recommendation-extractions/")) {
    const extractionId = path.slice("/v1/recommendation-extractions/".length);
    const extraction = getRecommendationExtractionById(dbPath, extractionId);

    if (!extraction) {
      sendError(res, 404, "NOT_FOUND", "Recommendation extraction not found", ctx);
      return;
    }

    sendJson(
      res,
      200,
      {
        extraction: {
          extractionId: extraction.extraction_id,
          status: extraction.status,
          prompt: extraction.prompt_text,
          author: extraction.author,
          creationTime: extraction.creation_time,
          sourceJobId: extraction.source_job_id,
          modelFamily: extraction.model_family,
          modelVersion: extraction.model_version,
          modelSelectionSource: extraction.model_selection_source,
          isBaseline: Boolean(extraction.is_baseline),
          hasProfile: Boolean(extraction.has_profile),
          hasSref: Boolean(extraction.has_sref),
          parserVersion: extraction.parser_version,
          createdAt: extraction.created_at,
          confirmedAt: extraction.confirmed_at,
          metadataRaw: JSON.parse(extraction.metadata_raw_json || "[]"),
        },
      },
      ctx
    );
    return;
  }

  if (method === "GET"
    && path.startsWith("/v1/recommendation-sessions/")
    && !path.endsWith("/post-result-feedback")) {
    const sessionId = path.slice("/v1/recommendation-sessions/".length);
    const session = getRecommendationSessionById(dbPath, sessionId);

    if (!session) {
      sendError(res, 404, "NOT_FOUND", "Recommendation session not found", ctx);
      return;
    }

    if (session.user_id !== authenticatedUserId) {
      sendError(res, 403, "FORBIDDEN", "Recommendation session is not accessible", ctx);
      return;
    }

    const prompt = getPromptById(dbPath, session.prompt_id);
    const recommendationRows = listRecommendationsBySessionId(dbPath, sessionId);

    sendJson(
      res,
      200,
      {
        session: {
          sessionId: session.session_id,
          extractionId: session.extraction_id,
          promptId: session.prompt_id,
          mode: session.mode,
          status: session.status,
          userId: session.user_id,
          createdAt: session.created_at,
          updatedAt: session.updated_at,
          prompt: prompt ? {
            promptId: prompt.prompt_id,
            promptText: prompt.prompt_text,
            status: prompt.status,
            version: prompt.version,
            curated: Boolean(prompt.curated_flag),
            createdAt: prompt.created_at,
          } : null,
          recommendations: recommendationRows.map((row) => {
            const threshold = confidenceThresholdForMode(session.mode);
            const isLowConfidence = row.confidence < threshold;
            const riskNotes = JSON.parse(row.risk_notes_json || "[]");
            const lowConfidence = isLowConfidence
              ? {
                isLowConfidence: true,
                reasonCode: "below_mode_threshold",
                threshold,
              }
              : {
                isLowConfidence: false,
              };

            return {
              recommendationId: row.recommendation_id,
              rank: row.rank,
              combinationId: row.combination_id,
              rationale: row.rationale,
              confidence: row.confidence,
              riskNotes,
              confidenceRisk: {
                confidence: row.confidence,
                riskNotes,
                lowConfidence,
              },
              lowConfidence,
              promptImprovements: JSON.parse(row.prompt_improvements_json || "[]"),
              createdAt: row.created_at,
            };
          }),
        },
      },
      ctx
    );
    return;
  }

  if (method === "POST" && path === "/v1/generated-images") {
    try {
      const body = await parseJsonBody(req);
      const payload = validateGeneratedImageUploadPayload(body);
      const session = getRecommendationSessionById(dbPath, payload.recommendationSessionId);
      if (!session) {
        sendError(res, 404, "NOT_FOUND", "Recommendation session not found", ctx);
        return;
      }
      if (session.user_id !== authenticatedUserId) {
        sendError(res, 403, "FORBIDDEN", "Recommendation session is not accessible", ctx);
        return;
      }

      const buffer = Buffer.from(payload.fileBase64, "base64");
      if (!buffer || buffer.length === 0) {
        sendError(res, 400, "INVALID_REQUEST", "Generated image upload failed validation", ctx, {
          reason: "fileBase64 decoded to empty payload",
        });
        return;
      }
      if (buffer.length > 8_000_000) {
        sendError(res, 400, "INVALID_REQUEST", "Generated image upload failed validation", ctx, {
          reason: "decoded image exceeds 8MB limit",
        });
        return;
      }

      const generatedImageId = `img_${crypto.randomUUID()}`;
      const ext = extensionForMimeType(payload.mimeType);
      const key = `generated/${session.session_id}/${generatedImageId}.${ext}`;
      const put = await storageAdapter.putObject({
        key,
        body: buffer,
        contentType: payload.mimeType,
        metadata: {
          recommendation_session_id: session.session_id,
          uploaded_by: authenticatedUserId,
          created_at: new Date().toISOString(),
        },
      });

      insertGeneratedImage(dbPath, {
        generatedImageId,
        recommendationSessionId: session.session_id,
        sourceType: "generated",
        storageKey: put.key,
        storageUri: put.storageUri,
        mimeType: payload.mimeType,
        fileName: payload.fileName,
        sizeBytes: put.sizeBytes,
        uploadedBy: authenticatedUserId,
      });

      sendJson(
        res,
        201,
        {
          generatedImage: {
            generatedImageId,
            recommendationSessionId: session.session_id,
            storageKey: put.key,
            storageUri: put.storageUri,
            mimeType: payload.mimeType,
            fileName: payload.fileName,
            sizeBytes: put.sizeBytes,
          },
        },
        ctx
      );
      return;
    } catch (error) {
      sendError(res, 400, "INVALID_REQUEST", "Generated image upload failed validation", ctx, {
        reason: error.message,
      });
      return;
    }
  }

  if (method === "POST" && path === "/v1/post-result-feedback") {
    try {
      const body = await parseJsonBody(req);
      const payload = validateFeedbackEvaluationPayload(body);
      const session = getRecommendationSessionById(dbPath, payload.recommendationSessionId);
      if (!session) {
        sendError(res, 404, "NOT_FOUND", "Recommendation session not found", ctx);
        return;
      }
      if (session.user_id !== authenticatedUserId) {
        sendError(res, 403, "FORBIDDEN", "Recommendation session is not accessible", ctx);
        return;
      }

      const recommendation = getRecommendationById(dbPath, payload.recommendationId);
      if (!recommendation || recommendation.recommendation_session_id !== session.session_id) {
        sendError(res, 400, "INVALID_REQUEST", "Feedback recommendation linkage is invalid", ctx, {
          reason: "recommendationId does not belong to recommendationSessionId",
        });
        return;
      }

      if (payload.generatedImageId) {
        const generatedImage = getGeneratedImageById(dbPath, payload.generatedImageId);
        if (!generatedImage || generatedImage.recommendation_session_id !== session.session_id) {
          sendError(res, 400, "INVALID_REQUEST", "Feedback generated image linkage is invalid", ctx, {
            reason: "generatedImageId does not belong to recommendationSessionId",
          });
          return;
        }
      }

      const feedbackId = `fb_${crypto.randomUUID()}`;
      const alignmentEvaluationId = `ae_${crypto.randomUUID()}`;
      const evaluation = evaluateFeedbackAlignment(payload);

      insertPostResultFeedback(dbPath, {
        feedbackId,
        recommendationSessionId: payload.recommendationSessionId,
        recommendationId: payload.recommendationId,
        generatedImageId: payload.generatedImageId,
        emojiRating: payload.emojiRating,
        usefulFlag: payload.usefulFlag,
        comments: payload.comments,
        evidenceStrength: evaluation.evidenceStrength,
        createdBy: authenticatedUserId,
      });
      insertAlignmentEvaluation(dbPath, {
        alignmentEvaluationId,
        feedbackId,
        alignmentScore: evaluation.alignmentScore,
        mismatchSummary: evaluation.mismatchSummary,
        suggestedPromptAdjustments: evaluation.suggestedPromptAdjustments,
        alternativeCombinationIds: evaluation.confidenceDelta < 0
          ? [recommendation.combination_id]
          : [],
        confidenceDelta: evaluation.confidenceDelta,
      });

      const storedFeedback = getPostResultFeedbackById(dbPath, feedbackId);
      sendJson(
        res,
        201,
        {
          feedback: mapFeedbackRow(storedFeedback),
          alignment: {
            alignmentEvaluationId,
            feedbackId,
            alignmentScore: evaluation.alignmentScore,
            mismatchSummary: evaluation.mismatchSummary,
            suggestedPromptAdjustments: evaluation.suggestedPromptAdjustments,
            alternativeCombinationIds: evaluation.confidenceDelta < 0 ? [recommendation.combination_id] : [],
            confidenceDelta: evaluation.confidenceDelta,
          },
        },
        ctx
      );
      return;
    } catch (error) {
      sendError(res, 400, "INVALID_REQUEST", "Post-result feedback failed validation", ctx, {
        reason: error.message,
      });
      return;
    }
  }

  if (method === "GET" && path.startsWith("/v1/post-result-feedback/")) {
    const feedbackId = path.slice("/v1/post-result-feedback/".length);
    const feedback = getPostResultFeedbackById(dbPath, feedbackId);
    if (!feedback) {
      sendError(res, 404, "NOT_FOUND", "Post-result feedback not found", ctx);
      return;
    }

    const session = getRecommendationSessionById(dbPath, feedback.recommendation_session_id);
    if (!session || session.user_id !== authenticatedUserId) {
      sendError(res, 403, "FORBIDDEN", "Post-result feedback is not accessible", ctx);
      return;
    }

    const alignment = getAlignmentEvaluationByFeedbackId(dbPath, feedbackId);
    sendJson(
      res,
      200,
      {
        feedback: mapFeedbackRow(feedback),
        alignment: mapAlignmentRow(alignment),
      },
      ctx
    );
    return;
  }

  if (method === "GET" && path.startsWith("/v1/recommendation-sessions/") && path.endsWith("/post-result-feedback")) {
    const sessionId = path.slice("/v1/recommendation-sessions/".length, -"/post-result-feedback".length);
    const session = getRecommendationSessionById(dbPath, sessionId);
    if (!session) {
      sendError(res, 404, "NOT_FOUND", "Recommendation session not found", ctx);
      return;
    }
    if (session.user_id !== authenticatedUserId) {
      sendError(res, 403, "FORBIDDEN", "Recommendation session is not accessible", ctx);
      return;
    }

    const feedbackRows = listPostResultFeedbackBySessionId(dbPath, sessionId);
    const feedback = feedbackRows.map((row) => {
      const alignment = getAlignmentEvaluationByFeedbackId(dbPath, row.feedback_id);
      return {
        ...mapFeedbackRow(row),
        alignment: mapAlignmentRow(alignment),
      };
    });

    sendJson(
      res,
      200,
      {
        recommendationSessionId: sessionId,
        feedback,
      },
      ctx
    );
    return;
  }

  if (method === "POST"
    && path.startsWith("/v1/admin/style-influences/")
    && path.endsWith("/governance")) {
    if (!requireAdminUser(dbPath, authenticatedUserId)) {
      sendError(res, 403, "FORBIDDEN", "Admin role is required", ctx);
      return;
    }

    const styleInfluenceId = path.slice("/v1/admin/style-influences/".length, -"/governance".length);
    const existing = getStyleInfluenceById(dbPath, styleInfluenceId);
    if (!existing) {
      sendError(res, 404, "NOT_FOUND", "Style influence not found", ctx);
      return;
    }

    try {
      const body = await parseJsonBody(req);
      const payload = validateStyleInfluenceGovernancePayload(body);
      const updated = updateStyleInfluenceGovernance(dbPath, styleInfluenceId, payload.action);
      const adminActionAuditId = `aud_${crypto.randomUUID()}`;
      insertAdminActionAudit(dbPath, {
        adminActionAuditId,
        adminUserId: authenticatedUserId,
        actionType: `style_influence.${payload.action}`,
        targetType: "style_influence",
        targetId: styleInfluenceId,
        reason: payload.reason,
      });
      const cache = invalidateRecommendationCaches();
      const auditRows = listAdminActionsAuditByTarget(dbPath, "style_influence", styleInfluenceId);
      const latestAudit = auditRows.length > 0 ? mapAdminAuditRow(auditRows[0]) : null;

      sendJson(
        res,
        200,
        {
          styleInfluence: {
            styleInfluenceId: updated.style_influence_id,
            styleInfluenceTypeId: updated.style_influence_type_id,
            influenceCode: updated.influence_code,
            status: updated.status,
            pinned: Boolean(updated.pinned_flag),
            createdBy: updated.created_by,
            createdAt: updated.created_at,
          },
          audit: latestAudit,
          cache,
        },
        ctx
      );
      return;
    } catch (error) {
      sendError(res, 400, "INVALID_REQUEST", "Governance update failed validation", ctx, {
        reason: error.message,
      });
      return;
    }
  }

  if (method === "GET"
    && path.startsWith("/v1/admin/style-influences/")
    && path.endsWith("/audit")) {
    if (!requireAdminUser(dbPath, authenticatedUserId)) {
      sendError(res, 403, "FORBIDDEN", "Admin role is required", ctx);
      return;
    }

    const styleInfluenceId = path.slice("/v1/admin/style-influences/".length, -"/audit".length);
    const existing = getStyleInfluenceById(dbPath, styleInfluenceId);
    if (!existing) {
      sendError(res, 404, "NOT_FOUND", "Style influence not found", ctx);
      return;
    }

    const rows = listAdminActionsAuditByTarget(dbPath, "style_influence", styleInfluenceId);
    sendJson(
      res,
      200,
      {
        targetType: "style_influence",
        targetId: styleInfluenceId,
        actions: rows.map(mapAdminAuditRow),
      },
      ctx
    );
    return;
  }

  if (method === "POST"
    && path.startsWith("/v1/admin/analysis-jobs/")
    && path.endsWith("/moderation")) {
    if (!requireAdminUser(dbPath, authenticatedUserId)) {
      sendError(res, 403, "FORBIDDEN", "Admin role is required", ctx);
      return;
    }

    const jobId = path.slice("/v1/admin/analysis-jobs/".length, -"/moderation".length);
    const existing = getJobById(dbPath, jobId);
    if (!existing) {
      sendError(res, 404, "NOT_FOUND", "Analysis job not found", ctx);
      return;
    }

    try {
      const body = await parseJsonBody(req);
      const payload = validateAnalysisModerationPayload(body);
      let rerunJob = null;
      let cache = null;

      if (payload.action === "flag") {
        updateJobModerationStatus(dbPath, jobId, "flagged");
      } else if (payload.action === "remove") {
        updateJobModerationStatus(dbPath, jobId, "removed");
        cache = invalidateRecommendationCaches();
      } else if (payload.action === "re-run") {
        const envelope = createJobEnvelope({
          idempotencyKey: `${existing.idempotency_key}:rerun:${crypto.randomUUID().slice(0, 8)}`,
          runType: existing.run_type,
          imageId: existing.image_id,
          context: {
            rerunOfJobId: existing.job_id,
            moderationReason: payload.reason,
          },
        });
        const rerunRecord = {
          jobId: envelope.jobId,
          status: "queued",
          moderationStatus: "none",
          rerunOfJobId: existing.job_id,
          runType: envelope.runType,
          imageId: envelope.imageId,
          idempotencyKey: envelope.idempotencyKey,
          submittedAt: envelope.submittedAt,
          modelFamily: envelope.modelFamily,
          modelVersion: envelope.modelVersion,
          modelSelectionSource: envelope.modelSelectionSource,
        };

        insertJob(dbPath, rerunRecord);
        try {
          queueAdapter.enqueue({
            body: JSON.stringify(envelope),
          });
        } catch (error) {
          updateJobStatus(dbPath, rerunRecord.jobId, "failed");
          sendError(res, 503, "QUEUE_UNAVAILABLE", "Unable to enqueue rerun analysis job", ctx, {
            reason: error.message,
          });
          return;
        }
        rerunJob = rerunRecord;
      } else {
        sendError(res, 400, "INVALID_REQUEST", "Unsupported moderation action", ctx);
        return;
      }

      const adminActionAuditId = `aud_${crypto.randomUUID()}`;
      insertAdminActionAudit(dbPath, {
        adminActionAuditId,
        adminUserId: authenticatedUserId,
        actionType: `analysis_job.${payload.action}`,
        targetType: "analysis_job",
        targetId: jobId,
        reason: payload.reason,
      });

      const updated = getJobById(dbPath, jobId);
      const auditRows = listAdminActionsAuditByTarget(dbPath, "analysis_job", jobId);
      const latestAudit = auditRows.length > 0 ? mapAdminAuditRow(auditRows[0]) : null;

      sendJson(
        res,
        200,
        {
          job: mapAnalysisJobRow(updated),
          rerunJob,
          audit: latestAudit,
          cache,
        },
        ctx
      );
      return;
    } catch (error) {
      sendError(res, 400, "INVALID_REQUEST", "Analysis moderation failed validation", ctx, {
        reason: error.message,
      });
      return;
    }
  }

  if (method === "GET"
    && path.startsWith("/v1/admin/analysis-jobs/")
    && path.endsWith("/moderation")) {
    if (!requireAdminUser(dbPath, authenticatedUserId)) {
      sendError(res, 403, "FORBIDDEN", "Admin role is required", ctx);
      return;
    }

    const jobId = path.slice("/v1/admin/analysis-jobs/".length, -"/moderation".length);
    const job = getJobById(dbPath, jobId);
    if (!job) {
      sendError(res, 404, "NOT_FOUND", "Analysis job not found", ctx);
      return;
    }

    const latestRun = getLatestAnalysisRunByJobId(dbPath, jobId);
    const rerunJobs = listRerunJobsByParentJobId(dbPath, jobId);
    const actions = listAdminActionsAuditByTarget(dbPath, "analysis_job", jobId).map(mapAdminAuditRow);

    sendJson(
      res,
      200,
      {
        job: mapAnalysisJobRow(job),
        latestRun: mapAnalysisRunRow(latestRun),
        rerunJobs: rerunJobs.map(mapAnalysisJobRow),
        actions,
      },
      ctx
    );
    return;
  }

  if (method === "POST"
    && path.startsWith("/v1/admin/prompts/")
    && path.endsWith("/curation")) {
    if (!requireAdminUser(dbPath, authenticatedUserId)) {
      sendError(res, 403, "FORBIDDEN", "Admin role is required", ctx);
      return;
    }

    const promptId = path.slice("/v1/admin/prompts/".length, -"/curation".length);
    const existing = getPromptById(dbPath, promptId);
    if (!existing) {
      sendError(res, 404, "NOT_FOUND", "Prompt not found", ctx);
      return;
    }

    try {
      const body = await parseJsonBody(req);
      const payload = validatePromptCurationPayload(body);
      const updated = updatePromptCurationStatus(dbPath, promptId, payload.status);
      const adminActionAuditId = `aud_${crypto.randomUUID()}`;
      insertAdminActionAudit(dbPath, {
        adminActionAuditId,
        adminUserId: authenticatedUserId,
        actionType: `prompt.curation.${payload.status}`,
        targetType: "prompt",
        targetId: promptId,
        reason: payload.reason,
      });
      const auditRows = listAdminActionsAuditByTarget(dbPath, "prompt", promptId);
      const latestAudit = auditRows.length > 0 ? mapAdminAuditRow(auditRows[0]) : null;

      sendJson(
        res,
        200,
        {
          prompt: {
            promptId: updated.prompt_id,
            promptText: updated.prompt_text,
            status: updated.status,
            version: updated.version,
            curated: Boolean(updated.curated_flag),
            createdBy: updated.created_by,
            createdAt: updated.created_at,
          },
          audit: latestAudit,
        },
        ctx
      );
      return;
    } catch (error) {
      sendError(res, 400, "INVALID_REQUEST", "Prompt curation update failed validation", ctx, {
        reason: error.message,
      });
      return;
    }
  }

  if (method === "GET"
    && path.startsWith("/v1/admin/prompts/")
    && path.endsWith("/curation")) {
    if (!requireAdminUser(dbPath, authenticatedUserId)) {
      sendError(res, 403, "FORBIDDEN", "Admin role is required", ctx);
      return;
    }

    const promptId = path.slice("/v1/admin/prompts/".length, -"/curation".length);
    const prompt = getPromptById(dbPath, promptId);
    if (!prompt) {
      sendError(res, 404, "NOT_FOUND", "Prompt not found", ctx);
      return;
    }

    const actions = listAdminActionsAuditByTarget(dbPath, "prompt", promptId).map(mapAdminAuditRow);
    sendJson(
      res,
      200,
      {
        prompt: {
          promptId: prompt.prompt_id,
          promptText: prompt.prompt_text,
          status: prompt.status,
          version: prompt.version,
          curated: Boolean(prompt.curated_flag),
          createdBy: prompt.created_by,
          createdAt: prompt.created_at,
        },
        actions,
      },
      ctx
    );
    return;
  }

  if (method === "GET" && path === "/v1/admin/approval-policy") {
    if (!requireAdminUser(dbPath, authenticatedUserId)) {
      sendError(res, 403, "FORBIDDEN", "Admin role is required", ctx);
      return;
    }

    const policy = getApprovalPolicy(dbPath);
    const actions = listAdminActionsAuditByTarget(dbPath, "approval_policy", "global").map(mapAdminAuditRow);
    sendJson(
      res,
      200,
      {
        policy: mapApprovalPolicyRow(policy),
        actions,
      },
      ctx
    );
    return;
  }

  if (method === "POST" && path === "/v1/admin/approval-policy") {
    if (!requireAdminUser(dbPath, authenticatedUserId)) {
      sendError(res, 403, "FORBIDDEN", "Admin role is required", ctx);
      return;
    }

    try {
      const body = await parseJsonBody(req);
      const payload = validateApprovalPolicyPayload(body);
      const updated = upsertApprovalPolicy(dbPath, {
        approvalMode: payload.approvalMode,
        updatedBy: authenticatedUserId,
      });
      const adminActionAuditId = `aud_${crypto.randomUUID()}`;
      insertAdminActionAudit(dbPath, {
        adminActionAuditId,
        adminUserId: authenticatedUserId,
        actionType: `approval_policy.update.${payload.approvalMode}`,
        targetType: "approval_policy",
        targetId: "global",
        reason: payload.reason,
      });
      const auditRows = listAdminActionsAuditByTarget(dbPath, "approval_policy", "global");
      const latestAudit = auditRows.length > 0 ? mapAdminAuditRow(auditRows[0]) : null;
      sendJson(
        res,
        200,
        {
          policy: mapApprovalPolicyRow(updated),
          audit: latestAudit,
        },
        ctx
      );
      return;
    } catch (error) {
      sendError(res, 400, "INVALID_REQUEST", "Approval policy update failed validation", ctx, {
        reason: error.message,
      });
      return;
    }
  }

  if (method === "POST"
    && path.startsWith("/v1/admin/analysis-jobs/")
    && path.endsWith("/approval")) {
    if (!requireAdminUser(dbPath, authenticatedUserId)) {
      sendError(res, 403, "FORBIDDEN", "Admin role is required", ctx);
      return;
    }

    const jobId = path.slice("/v1/admin/analysis-jobs/".length, -"/approval".length);
    const existing = getJobById(dbPath, jobId);
    if (!existing) {
      sendError(res, 404, "NOT_FOUND", "Analysis job not found", ctx);
      return;
    }

    try {
      const body = await parseJsonBody(req);
      const payload = validateAnalysisApprovalPayload(body);
      if (existing.status !== "pending_approval") {
        sendError(res, 409, "INVALID_STATE", "Analysis job is not pending approval", ctx, {
          status: existing.status,
        });
        return;
      }

      if (payload.action === "approve") {
        const envelope = createStoredJobEnvelope(existing);
        try {
          queueAdapter.enqueue({
            body: JSON.stringify(envelope),
          });
        } catch (error) {
          sendError(res, 503, "QUEUE_UNAVAILABLE", "Unable to enqueue approved analysis job", ctx, {
            reason: error.message,
          });
          return;
        }
        updateJobStatus(dbPath, existing.job_id, "queued");
      } else {
        updateJobStatus(dbPath, existing.job_id, "rejected");
      }

      const adminActionAuditId = `aud_${crypto.randomUUID()}`;
      insertAdminActionAudit(dbPath, {
        adminActionAuditId,
        adminUserId: authenticatedUserId,
        actionType: `analysis_job.approval.${payload.action}`,
        targetType: "analysis_job",
        targetId: jobId,
        reason: payload.reason,
      });
      const updated = getJobById(dbPath, jobId);
      const auditRows = listAdminActionsAuditByTarget(dbPath, "analysis_job", jobId);
      const latestAudit = auditRows.length > 0 ? mapAdminAuditRow(auditRows[0]) : null;
      sendJson(
        res,
        200,
        {
          job: mapAnalysisJobRow(updated),
          audit: latestAudit,
        },
        ctx
      );
      return;
    } catch (error) {
      sendError(res, 400, "INVALID_REQUEST", "Analysis approval failed validation", ctx, {
        reason: error.message,
      });
      return;
    }
  }

  if (method === "GET"
    && path.startsWith("/v1/admin/analysis-jobs/")
    && path.endsWith("/approval")) {
    if (!requireAdminUser(dbPath, authenticatedUserId)) {
      sendError(res, 403, "FORBIDDEN", "Admin role is required", ctx);
      return;
    }

    const jobId = path.slice("/v1/admin/analysis-jobs/".length, -"/approval".length);
    const job = getJobById(dbPath, jobId);
    if (!job) {
      sendError(res, 404, "NOT_FOUND", "Analysis job not found", ctx);
      return;
    }

    const actions = listAdminActionsAuditByTarget(dbPath, "analysis_job", jobId)
      .filter((entry) => entry.action_type.startsWith("analysis_job.approval."))
      .map(mapAdminAuditRow);
    sendJson(
      res,
      200,
      {
        job: mapAnalysisJobRow(job),
        actions,
      },
      ctx
    );
    return;
  }

  if (method === "POST" && path === "/v1/analysis-jobs") {
    try {
      const body = await parseJsonBody(req);
      if (!body.idempotencyKey || !body.runType || !body.imageId) {
        sendError(res, 400, "INVALID_REQUEST", "Missing required submit fields", ctx, {
          required: ["idempotencyKey", "runType", "imageId"],
        });
        return;
      }

      const existingJob = getJobByIdempotencyKey(dbPath, body.idempotencyKey);
      if (existingJob) {
        const policy = getApprovalPolicy(dbPath);
        sendJson(
          res,
          200,
          {
            reused: true,
            job: mapAnalysisJobRow(existingJob),
            approvalPolicy: mapApprovalPolicyRow(policy),
          },
          ctx
        );
        return;
      }

      const policy = getApprovalPolicy(dbPath);
      const envelope = createJobEnvelope(body);
      const requiresManualApproval = policy.approval_mode === "manual";
      const jobRecord = {
        jobId: envelope.jobId,
        status: requiresManualApproval ? "pending_approval" : "queued",
        moderationStatus: "none",
        rerunOfJobId: null,
        runType: envelope.runType,
        imageId: envelope.imageId,
        idempotencyKey: envelope.idempotencyKey,
        submittedAt: envelope.submittedAt,
        modelFamily: envelope.modelFamily,
        modelVersion: envelope.modelVersion,
        modelSelectionSource: envelope.modelSelectionSource,
      };

      insertJob(dbPath, jobRecord);
      if (!requiresManualApproval) {
        try {
          queueAdapter.enqueue({
            body: JSON.stringify(envelope),
          });
        } catch (error) {
          updateJobStatus(dbPath, jobRecord.jobId, "failed");
          sendError(res, 503, "QUEUE_UNAVAILABLE", "Unable to enqueue analysis job", ctx, {
            reason: error.message,
          });
          return;
        }

        logJson("info", "analysis.job.enqueued", {
          request_id: ctx.requestId,
          job_id: jobRecord.jobId,
          run_type: jobRecord.runType,
          status: jobRecord.status,
          approval_mode: policy.approval_mode,
        });
      } else {
        logJson("info", "analysis.job.pending_approval", {
          request_id: ctx.requestId,
          job_id: jobRecord.jobId,
          run_type: jobRecord.runType,
          status: jobRecord.status,
          approval_mode: policy.approval_mode,
        });
      }

      sendJson(
        res,
        202,
        {
          reused: false,
          job: mapAnalysisJobRow(getJobById(dbPath, jobRecord.jobId)),
          approvalPolicy: mapApprovalPolicyRow(policy),
        },
        ctx
      );
      return;
    } catch (error) {
      sendError(res, 400, "INVALID_REQUEST", "Job submission failed validation", ctx, {
        reason: error.message,
      });
      return;
    }
  }

  if (method === "GET" && path.startsWith("/v1/analysis-jobs/")) {
    if (path.endsWith("/result")) {
      const jobId = path.slice("/v1/analysis-jobs/".length, -"/result".length);
      const job = getJobById(dbPath, jobId);
      if (!job) {
        sendError(res, 404, "NOT_FOUND", "Analysis job not found", ctx);
        return;
      }

      const latestRun = getLatestAnalysisRunByJobId(dbPath, jobId);
      const traitAnalysis = getImageTraitAnalysisByJobId(dbPath, jobId);

      sendJson(
        res,
        200,
        {
          job: mapAnalysisJobRow(job),
          latestRun: mapAnalysisRunRow(latestRun),
          result: job.run_type === "trait" && !SUPPRESSED_ANALYSIS_MODERATION_STATUSES.has(job.moderation_status || "none")
            ? {
              traitAnalysis: mapImageTraitAnalysisRow(traitAnalysis),
            }
            : null,
        },
        ctx
      );
      return;
    }

    const jobId = path.slice("/v1/analysis-jobs/".length);
    const job = getJobById(dbPath, jobId);

    if (!job) {
      sendError(res, 404, "NOT_FOUND", "Analysis job not found", ctx);
      return;
    }

    sendJson(
      res,
      200,
      {
        job: mapAnalysisJobRow(job),
      },
      ctx
    );
    return;
  }

  sendError(res, 404, "NOT_FOUND", "Route not found", ctx);
}

function main() {
  const config = loadConfig();
  setCurrentDefaultModels({
    standard: config.models.defaultStandardVersion,
    niji: config.models.defaultNijiVersion,
  });
  const dbReadiness = assertDatabaseReady(config.database.databaseUrl);
  const dbPath = ensureReady(config.database.databaseUrl);
  const queueAdapter = createQueueAdapter(config);
  const storageAdapter = createStorageAdapter({
    appEnv: config.runtime.appEnv,
    bucket: config.storage.bucket,
    region: config.storage.region,
    endpoint: config.storage.endpoint,
  });
  const server = http.createServer((req, res) => {
    requestHandler(req, res, config, dbPath, queueAdapter, storageAdapter).catch((error) => {
      const ctx = createRequestContext(req, config);
      logJson("error", "api.request.unhandled_error", {
        request_id: ctx.requestId,
        error: error.message,
      });
      sendError(res, 500, "INTERNAL_ERROR", "Unhandled server error", ctx);
    });
  });

  Promise.all([storageAdapter.healthcheck(), Promise.resolve(queueAdapter.healthcheck())]).then(([storageHealth, queueHealth]) => {
    server.listen(config.runtime.port, () => {
      logJson("info", "api.server.started", {
        port: config.runtime.port,
        app_env: config.runtime.appEnv,
        service: config.observability.serviceName,
        contract_version: CONTRACT_VERSION,
        database_path: dbReadiness.dbPath,
        storage_mode: storageHealth.mode,
        storage_bucket: storageHealth.bucket,
        queue_mode: queueHealth.mode,
        queue_url: queueHealth.queueUrl,
      });
    });
  }).catch((error) => {
    logJson("error", "api.storage.init_failed", {
      error: error.message,
    });
    process.exitCode = 1;
  });
}

main();
