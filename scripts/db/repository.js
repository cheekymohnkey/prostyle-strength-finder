const { parseDatabaseUrl, ensureDbParentDir, ensureMigrationsTable, runSql } = require("./lib");

function quote(value) {
  if (value === null || value === undefined) {
    return "NULL";
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

function nowIso() {
  return new Date().toISOString();
}

function ensureReady(databaseUrl) {
  const dbPath = parseDatabaseUrl(databaseUrl);
  ensureDbParentDir(dbPath);
  ensureMigrationsTable(dbPath);
  return dbPath;
}

function queryJson(dbPath, sql) {
  const output = runSql(dbPath, sql, { json: true });
  if (!output) {
    return [];
  }
  return JSON.parse(output);
}

function exec(dbPath, sql) {
  runSql(dbPath, sql);
}

function getUserById(dbPath, userId) {
  const rows = queryJson(
    dbPath,
    `SELECT user_id, role, status, created_at, updated_at
     FROM users
     WHERE user_id = ${quote(userId)}
     LIMIT 1;`
  );
  return rows[0] || null;
}

function insertUser(dbPath, input) {
  const createdAt = input.createdAt || nowIso();
  const updatedAt = input.updatedAt || createdAt;
  exec(
    dbPath,
    `INSERT INTO users (
       user_id, role, status, created_at, updated_at
     ) VALUES (
       ${quote(input.userId)},
       ${quote(input.role || "consumer")},
       ${quote(input.status || "active")},
       ${quote(createdAt)},
       ${quote(updatedAt)}
     );`
  );
}

function ensureUser(dbPath, input) {
  const existing = getUserById(dbPath, input.userId);
  if (existing) {
    return existing;
  }
  insertUser(dbPath, input);
  return getUserById(dbPath, input.userId);
}

function getJobById(dbPath, jobId) {
  const rows = queryJson(
    dbPath,
    `SELECT job_id, idempotency_key, run_type, image_id, status, submitted_at, updated_at,
            model_family, model_version, model_selection_source, moderation_status, rerun_of_job_id
     FROM analysis_jobs
     WHERE job_id = ${quote(jobId)}
     LIMIT 1;`
  );
  return rows[0] || null;
}

function getJobByIdempotencyKey(dbPath, idempotencyKey) {
  const rows = queryJson(
    dbPath,
    `SELECT job_id, idempotency_key, run_type, image_id, status, submitted_at, updated_at,
            model_family, model_version, model_selection_source, moderation_status, rerun_of_job_id
     FROM analysis_jobs
     WHERE idempotency_key = ${quote(idempotencyKey)}
     LIMIT 1;`
  );
  return rows[0] || null;
}

function insertJob(dbPath, input) {
  const submittedAt = input.submittedAt || nowIso();
  const updatedAt = input.updatedAt || submittedAt;
  exec(
    dbPath,
    `INSERT INTO analysis_jobs (
       job_id, idempotency_key, run_type, image_id, status, submitted_at, updated_at,
       model_family, model_version, model_selection_source, moderation_status, rerun_of_job_id
     )
     VALUES (
       ${quote(input.jobId)},
       ${quote(input.idempotencyKey)},
       ${quote(input.runType)},
       ${quote(input.imageId)},
       ${quote(input.status || "queued")},
       ${quote(submittedAt)},
       ${quote(updatedAt)},
       ${quote(input.modelFamily)},
       ${quote(input.modelVersion)},
       ${quote(input.modelSelectionSource)},
       ${quote(input.moderationStatus || "none")},
       ${quote(input.rerunOfJobId || null)}
     );`
  );
}

function ensureJob(dbPath, input) {
  const existing = getJobById(dbPath, input.jobId);
  if (existing) {
    return existing;
  }
  insertJob(dbPath, input);
  return getJobById(dbPath, input.jobId);
}

function updateJobStatus(dbPath, jobId, status) {
  exec(
    dbPath,
    `UPDATE analysis_jobs
     SET status = ${quote(status)}, updated_at = ${quote(nowIso())}
     WHERE job_id = ${quote(jobId)};`
  );
}

function updateJobModerationStatus(dbPath, jobId, moderationStatus) {
  exec(
    dbPath,
    `UPDATE analysis_jobs
     SET moderation_status = ${quote(moderationStatus)}, updated_at = ${quote(nowIso())}
     WHERE job_id = ${quote(jobId)};`
  );
}

function listRerunJobsByParentJobId(dbPath, parentJobId) {
  return queryJson(
    dbPath,
    `SELECT job_id, idempotency_key, run_type, image_id, status, submitted_at, updated_at,
            model_family, model_version, model_selection_source, moderation_status, rerun_of_job_id
     FROM analysis_jobs
     WHERE rerun_of_job_id = ${quote(parentJobId)}
     ORDER BY submitted_at DESC;`
  );
}

function getNextAttemptCount(dbPath, jobId) {
  const rows = queryJson(
    dbPath,
    `SELECT COALESCE(MAX(attempt_count), 0) + 1 AS next_attempt
     FROM analysis_runs
     WHERE job_id = ${quote(jobId)};`
  );
  return Number(rows[0]?.next_attempt || 1);
}

function getLatestAnalysisRunByJobId(dbPath, jobId) {
  const rows = queryJson(
    dbPath,
    `SELECT analysis_run_id, job_id, status, attempt_count, started_at, completed_at,
            last_error_code, last_error_message, model_family, model_version
     FROM analysis_runs
     WHERE job_id = ${quote(jobId)}
     ORDER BY attempt_count DESC, started_at DESC
     LIMIT 1;`
  );
  return rows[0] || null;
}

function insertAnalysisRun(dbPath, input) {
  exec(
    dbPath,
    `INSERT INTO analysis_runs (
       analysis_run_id, job_id, status, attempt_count, started_at, completed_at,
       last_error_code, last_error_message, model_family, model_version
     ) VALUES (
       ${quote(input.analysisRunId)},
       ${quote(input.jobId)},
       ${quote(input.status)},
       ${Number(input.attemptCount || 1)},
       ${quote(input.startedAt || nowIso())},
       ${quote(input.completedAt || null)},
       ${quote(input.lastErrorCode || null)},
       ${quote(input.lastErrorMessage || null)},
       ${quote(input.modelFamily || null)},
       ${quote(input.modelVersion || null)}
     );`
  );
}

function updateAnalysisRun(dbPath, analysisRunId, input) {
  exec(
    dbPath,
    `UPDATE analysis_runs
     SET
       status = ${quote(input.status)},
       completed_at = ${quote(input.completedAt || null)},
       last_error_code = ${quote(input.lastErrorCode || null)},
       last_error_message = ${quote(input.lastErrorMessage || null)}
     WHERE analysis_run_id = ${quote(analysisRunId)};`
  );
}

function insertImageTraitAnalysis(dbPath, input) {
  const createdAt = input.createdAt || nowIso();
  exec(
    dbPath,
    `INSERT INTO image_trait_analyses (
       image_trait_analysis_id, analysis_run_id, job_id, image_id, trait_schema_version,
       trait_vector_json, evidence_summary, created_at
     ) VALUES (
       ${quote(input.imageTraitAnalysisId)},
       ${quote(input.analysisRunId)},
       ${quote(input.jobId)},
       ${quote(input.imageId)},
       ${quote(input.traitSchemaVersion)},
       ${quote(JSON.stringify(input.traitVector || {}))},
       ${quote(input.evidenceSummary || null)},
       ${quote(createdAt)}
     );`
  );
}

function getImageTraitAnalysisByJobId(dbPath, jobId) {
  const rows = queryJson(
    dbPath,
    `SELECT image_trait_analysis_id, analysis_run_id, job_id, image_id, trait_schema_version,
            trait_vector_json, evidence_summary, created_at
     FROM image_trait_analyses
     WHERE job_id = ${quote(jobId)}
     ORDER BY created_at DESC
     LIMIT 1;`
  );
  return rows[0] || null;
}

function getStyleInfluenceById(dbPath, styleInfluenceId) {
  const rows = queryJson(
    dbPath,
    `SELECT style_influence_id, style_influence_type_id, influence_code, status,
            pinned_flag, created_by, created_at
     FROM style_influences
     WHERE style_influence_id = ${quote(styleInfluenceId)}
     LIMIT 1;`
  );
  return rows[0] || null;
}

function updateStyleInfluenceGovernance(dbPath, styleInfluenceId, action) {
  const normalized = String(action || "").trim();
  if (normalized === "disable") {
    exec(
      dbPath,
      `UPDATE style_influences
       SET status = 'disabled'
       WHERE style_influence_id = ${quote(styleInfluenceId)};`
    );
  } else if (normalized === "pin") {
    exec(
      dbPath,
      `UPDATE style_influences
       SET pinned_flag = 1
       WHERE style_influence_id = ${quote(styleInfluenceId)};`
    );
  } else if (normalized === "unpin") {
    exec(
      dbPath,
      `UPDATE style_influences
       SET pinned_flag = 0
       WHERE style_influence_id = ${quote(styleInfluenceId)};`
    );
  } else if (normalized === "remove") {
    exec(
      dbPath,
      `UPDATE style_influences
       SET status = 'removed',
           pinned_flag = 0
       WHERE style_influence_id = ${quote(styleInfluenceId)};`
    );
  } else {
    throw new Error(`Unsupported governance action: ${action}`);
  }

  return getStyleInfluenceById(dbPath, styleInfluenceId);
}

function insertAdminActionAudit(dbPath, input) {
  const createdAt = input.createdAt || nowIso();
  exec(
    dbPath,
    `INSERT INTO admin_actions_audit (
       admin_action_audit_id, admin_user_id, action_type, target_type, target_id, reason, created_at
     ) VALUES (
       ${quote(input.adminActionAuditId)},
       ${quote(input.adminUserId)},
       ${quote(input.actionType)},
       ${quote(input.targetType)},
       ${quote(input.targetId)},
       ${quote(input.reason)},
       ${quote(createdAt)}
     );`
  );
}

function listAdminActionsAuditByTarget(dbPath, targetType, targetId) {
  return queryJson(
    dbPath,
    `SELECT admin_action_audit_id, admin_user_id, action_type, target_type, target_id, reason, created_at
     FROM admin_actions_audit
     WHERE target_type = ${quote(targetType)}
       AND target_id = ${quote(targetId)}
     ORDER BY created_at DESC;`
  );
}

function getRecommendationExtractionById(dbPath, extractionId) {
  const rows = queryJson(
    dbPath,
    `SELECT extraction_id, status, prompt_text, author, creation_time, source_job_id,
            model_family, model_version, model_selection_source,
            is_baseline, has_profile, has_sref, parser_version,
            metadata_raw_json, created_at, confirmed_at
     FROM recommendation_extractions
     WHERE extraction_id = ${quote(extractionId)}
     LIMIT 1;`
  );
  return rows[0] || null;
}

function insertRecommendationExtraction(dbPath, input) {
  const createdAt = input.createdAt || nowIso();
  exec(
    dbPath,
    `INSERT INTO recommendation_extractions (
       extraction_id, status, prompt_text, author, creation_time, source_job_id,
       model_family, model_version, model_selection_source,
       is_baseline, has_profile, has_sref,
       parser_version, metadata_raw_json, created_at, confirmed_at
     ) VALUES (
       ${quote(input.extractionId)},
       ${quote(input.status || "extracted")},
       ${quote(input.promptText)},
       ${quote(input.author || null)},
       ${quote(input.creationTime || null)},
       ${quote(input.sourceJobId || null)},
       ${quote(input.modelFamily)},
       ${quote(input.modelVersion)},
       ${quote(input.modelSelectionSource)},
       ${input.isBaseline ? 1 : 0},
       ${input.hasProfile ? 1 : 0},
       ${input.hasSref ? 1 : 0},
       ${quote(input.parserVersion)},
       ${quote(JSON.stringify(input.metadataRaw || []))},
       ${quote(createdAt)},
       ${quote(input.confirmedAt || null)}
     );`
  );
}

function markRecommendationExtractionConfirmed(dbPath, extractionId) {
  exec(
    dbPath,
    `UPDATE recommendation_extractions
     SET
       status = 'confirmed',
       confirmed_at = COALESCE(confirmed_at, ${quote(nowIso())})
     WHERE extraction_id = ${quote(extractionId)};`
  );
  const extraction = getRecommendationExtractionById(dbPath, extractionId);
  return extraction ? extraction.confirmed_at : null;
}

function getPromptByText(dbPath, promptText) {
  const rows = queryJson(
    dbPath,
    `SELECT prompt_id, prompt_text, status, version, curated_flag, created_by, created_at
     FROM prompts
     WHERE prompt_text = ${quote(promptText)}
     ORDER BY created_at ASC
     LIMIT 1;`
  );
  return rows[0] || null;
}

function getPromptById(dbPath, promptId) {
  const rows = queryJson(
    dbPath,
    `SELECT prompt_id, prompt_text, status, version, curated_flag, created_by, created_at
     FROM prompts
     WHERE prompt_id = ${quote(promptId)}
     LIMIT 1;`
  );
  return rows[0] || null;
}

function insertPrompt(dbPath, input) {
  const createdAt = input.createdAt || nowIso();
  exec(
    dbPath,
    `INSERT INTO prompts (
       prompt_id, prompt_text, status, version, curated_flag, created_by, created_at
     ) VALUES (
       ${quote(input.promptId)},
       ${quote(input.promptText)},
       ${quote(input.status || "active")},
       ${quote(input.version || "v1")},
       ${input.curatedFlag ? 1 : 0},
       ${quote(input.createdBy || null)},
       ${quote(createdAt)}
     );`
  );
}

function ensurePromptByText(dbPath, input) {
  const existing = getPromptByText(dbPath, input.promptText);
  if (existing) {
    return existing;
  }

  insertPrompt(dbPath, input);
  return getPromptByText(dbPath, input.promptText);
}

function getRecommendationSessionByExtractionId(dbPath, extractionId) {
  const rows = queryJson(
    dbPath,
    `SELECT session_id, user_id, mode, extraction_id, prompt_id, status, created_at, updated_at
     FROM recommendation_sessions
     WHERE extraction_id = ${quote(extractionId)}
     LIMIT 1;`
  );
  return rows[0] || null;
}

function getRecommendationSessionById(dbPath, sessionId) {
  const rows = queryJson(
    dbPath,
    `SELECT session_id, user_id, mode, extraction_id, prompt_id, status, created_at, updated_at
     FROM recommendation_sessions
     WHERE session_id = ${quote(sessionId)}
     LIMIT 1;`
  );
  return rows[0] || null;
}

function insertRecommendationSession(dbPath, input) {
  const createdAt = input.createdAt || nowIso();
  const updatedAt = input.updatedAt || createdAt;
  exec(
    dbPath,
    `INSERT INTO recommendation_sessions (
       session_id, user_id, mode, extraction_id, prompt_id, status, created_at, updated_at
     ) VALUES (
       ${quote(input.sessionId)},
       ${quote(input.userId)},
       ${quote(input.mode)},
       ${quote(input.extractionId)},
       ${quote(input.promptId)},
       ${quote(input.status || "confirmed")},
       ${quote(createdAt)},
       ${quote(updatedAt)}
     );`
  );
}

function updateRecommendationSessionStatus(dbPath, sessionId, status) {
  exec(
    dbPath,
    `UPDATE recommendation_sessions
     SET
       status = ${quote(status)},
       updated_at = ${quote(nowIso())}
     WHERE session_id = ${quote(sessionId)};`
  );
}

function ensureRecommendationSession(dbPath, input) {
  const existing = getRecommendationSessionByExtractionId(dbPath, input.extractionId);
  if (existing) {
    return existing;
  }

  insertRecommendationSession(dbPath, input);
  return getRecommendationSessionByExtractionId(dbPath, input.extractionId);
}

function insertRecommendation(dbPath, input) {
  const createdAt = input.createdAt || nowIso();
  exec(
    dbPath,
    `INSERT INTO recommendations (
       recommendation_id, recommendation_session_id, rank, combination_id,
       rationale, confidence, risk_notes_json, prompt_improvements_json, created_at
     ) VALUES (
       ${quote(input.recommendationId)},
       ${quote(input.recommendationSessionId)},
       ${Number(input.rank)},
       ${quote(input.combinationId)},
       ${quote(input.rationale)},
       ${Number(input.confidence)},
       ${quote(JSON.stringify(input.riskNotes || []))},
       ${quote(JSON.stringify(input.promptImprovements || []))},
       ${quote(createdAt)}
     );`
  );
}

function listRecommendationsBySessionId(dbPath, sessionId) {
  return queryJson(
    dbPath,
    `SELECT recommendation_id, recommendation_session_id, rank, combination_id,
            rationale, confidence, risk_notes_json, prompt_improvements_json, created_at
     FROM recommendations
     WHERE recommendation_session_id = ${quote(sessionId)}
     ORDER BY rank ASC;`
  );
}

function getRecommendationCountBySessionId(dbPath, sessionId) {
  const rows = queryJson(
    dbPath,
    `SELECT COUNT(*) AS recommendation_count
     FROM recommendations
     WHERE recommendation_session_id = ${quote(sessionId)};`
  );
  return Number(rows[0]?.recommendation_count || 0);
}

function getRecommendationById(dbPath, recommendationId) {
  const rows = queryJson(
    dbPath,
    `SELECT recommendation_id, recommendation_session_id, rank, combination_id,
            rationale, confidence, risk_notes_json, prompt_improvements_json, created_at
     FROM recommendations
     WHERE recommendation_id = ${quote(recommendationId)}
     LIMIT 1;`
  );
  return rows[0] || null;
}

function insertGeneratedImage(dbPath, input) {
  const createdAt = input.createdAt || nowIso();
  exec(
    dbPath,
    `INSERT INTO generated_images (
       generated_image_id, recommendation_session_id, source_type, storage_key,
       storage_uri, mime_type, file_name, size_bytes, uploaded_by, created_at
     ) VALUES (
       ${quote(input.generatedImageId)},
       ${quote(input.recommendationSessionId)},
       ${quote(input.sourceType || "generated")},
       ${quote(input.storageKey)},
       ${quote(input.storageUri)},
       ${quote(input.mimeType)},
       ${quote(input.fileName)},
       ${Number(input.sizeBytes)},
       ${quote(input.uploadedBy)},
       ${quote(createdAt)}
     );`
  );
}

function getGeneratedImageById(dbPath, generatedImageId) {
  const rows = queryJson(
    dbPath,
    `SELECT generated_image_id, recommendation_session_id, source_type, storage_key,
            storage_uri, mime_type, file_name, size_bytes, uploaded_by, created_at
     FROM generated_images
     WHERE generated_image_id = ${quote(generatedImageId)}
     LIMIT 1;`
  );
  return rows[0] || null;
}

function insertPostResultFeedback(dbPath, input) {
  const createdAt = input.createdAt || nowIso();
  const updatedAt = input.updatedAt || createdAt;
  exec(
    dbPath,
    `INSERT INTO post_result_feedback (
       feedback_id, recommendation_session_id, recommendation_id, generated_image_id,
       emoji_rating, useful_flag, comments, evidence_strength, created_by, created_at, updated_at
     ) VALUES (
       ${quote(input.feedbackId)},
       ${quote(input.recommendationSessionId)},
       ${quote(input.recommendationId)},
       ${quote(input.generatedImageId || null)},
       ${quote(input.emojiRating || null)},
       ${input.usefulFlag === null || input.usefulFlag === undefined ? "NULL" : (input.usefulFlag ? 1 : 0)},
       ${quote(input.comments || null)},
       ${quote(input.evidenceStrength || "minor")},
       ${quote(input.createdBy || null)},
       ${quote(createdAt)},
       ${quote(updatedAt)}
     );`
  );
}

function getPostResultFeedbackById(dbPath, feedbackId) {
  const rows = queryJson(
    dbPath,
    `SELECT feedback_id, recommendation_session_id, recommendation_id, generated_image_id,
            emoji_rating, useful_flag, comments, evidence_strength, created_by, created_at, updated_at
     FROM post_result_feedback
     WHERE feedback_id = ${quote(feedbackId)}
     LIMIT 1;`
  );
  return rows[0] || null;
}

function listPostResultFeedbackBySessionId(dbPath, sessionId) {
  return queryJson(
    dbPath,
    `SELECT feedback_id, recommendation_session_id, recommendation_id, generated_image_id,
            emoji_rating, useful_flag, comments, evidence_strength, created_by, created_at, updated_at
     FROM post_result_feedback
     WHERE recommendation_session_id = ${quote(sessionId)}
     ORDER BY created_at DESC;`
  );
}

function insertAlignmentEvaluation(dbPath, input) {
  const createdAt = input.createdAt || nowIso();
  exec(
    dbPath,
    `INSERT INTO alignment_evaluations (
       alignment_evaluation_id, feedback_id, alignment_score, mismatch_summary,
       suggested_prompt_adjustments_json, alternative_combination_ids_json, confidence_delta, created_at
     ) VALUES (
       ${quote(input.alignmentEvaluationId)},
       ${quote(input.feedbackId)},
       ${Number(input.alignmentScore)},
       ${quote(input.mismatchSummary)},
       ${quote(JSON.stringify(input.suggestedPromptAdjustments || []))},
       ${quote(JSON.stringify(input.alternativeCombinationIds || []))},
       ${Number(input.confidenceDelta || 0)},
       ${quote(createdAt)}
     );`
  );
}

function getAlignmentEvaluationByFeedbackId(dbPath, feedbackId) {
  const rows = queryJson(
    dbPath,
    `SELECT alignment_evaluation_id, feedback_id, alignment_score, mismatch_summary,
            suggested_prompt_adjustments_json, alternative_combination_ids_json, confidence_delta, created_at
     FROM alignment_evaluations
     WHERE feedback_id = ${quote(feedbackId)}
     LIMIT 1;`
  );
  return rows[0] || null;
}

function listActiveStyleInfluenceCombinations(dbPath) {
  return queryJson(
    dbPath,
    `SELECT
       c.combination_id,
       c.name,
       COUNT(*) AS total_items,
       SUM(CASE WHEN sit.parameter_prefix = '--profile' THEN 1 ELSE 0 END) AS profile_items,
       SUM(CASE WHEN sit.parameter_prefix = '--sref' THEN 1 ELSE 0 END) AS sref_items,
       SUM(CASE WHEN si.pinned_flag = 1 THEN 1 ELSE 0 END) AS pinned_items,
       SUM(CASE WHEN si.status = 'active' AND sit.enabled_flag = 1 THEN 1 ELSE 0 END) AS eligible_items,
       GROUP_CONCAT(si.influence_code, ' ') AS influence_codes
     FROM style_influence_combinations c
     JOIN style_influence_combination_items sci
       ON sci.combination_id = c.combination_id
     JOIN style_influences si
       ON si.style_influence_id = sci.style_influence_id
     JOIN style_influence_types sit
       ON sit.style_influence_type_id = si.style_influence_type_id
     WHERE c.active_flag = 1
     GROUP BY c.combination_id, c.name
     HAVING total_items > 0 AND eligible_items = total_items
     ORDER BY c.combination_id ASC;`
  );
}

module.exports = {
  ensureReady,
  getUserById,
  insertUser,
  ensureUser,
  getJobById,
  getJobByIdempotencyKey,
  insertJob,
  ensureJob,
  updateJobStatus,
  updateJobModerationStatus,
  listRerunJobsByParentJobId,
  getNextAttemptCount,
  getLatestAnalysisRunByJobId,
  insertAnalysisRun,
  updateAnalysisRun,
  insertImageTraitAnalysis,
  getImageTraitAnalysisByJobId,
  getStyleInfluenceById,
  updateStyleInfluenceGovernance,
  insertAdminActionAudit,
  listAdminActionsAuditByTarget,
  getRecommendationExtractionById,
  insertRecommendationExtraction,
  markRecommendationExtractionConfirmed,
  getPromptByText,
  getPromptById,
  insertPrompt,
  ensurePromptByText,
  getRecommendationSessionByExtractionId,
  getRecommendationSessionById,
  insertRecommendationSession,
  updateRecommendationSessionStatus,
  ensureRecommendationSession,
  insertRecommendation,
  listRecommendationsBySessionId,
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
};
