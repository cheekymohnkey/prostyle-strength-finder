const crypto = require("crypto");
const { assertDatabaseReady } = require("../db/runtime");
const {
  ensureReady,
  insertRecommendationExtraction,
  insertPrompt,
  insertRecommendationSession,
  insertRecommendation,
  insertPostResultFeedback,
  getPostResultFeedbackById,
  listPostResultFeedbackBySessionId,
  insertAlignmentEvaluation,
  getAlignmentEvaluationByFeedbackId,
} = require("../db/repository");

function requireEnv(key) {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value.trim();
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function main() {
  const databaseUrl = requireEnv("DATABASE_URL");
  assertDatabaseReady(databaseUrl);
  const dbPath = ensureReady(databaseUrl);

  const now = new Date().toISOString();
  const suffix = crypto.randomUUID();
  const extractionId = `rex_feedback_foundation_${suffix}`;
  const promptId = `prm_feedback_foundation_${suffix}`;
  const sessionId = `rs_feedback_foundation_${suffix}`;
  const recommendationId = `rec_feedback_foundation_${suffix}`;
  const feedbackId = `fb_feedback_foundation_${suffix}`;
  const alignmentEvaluationId = `ae_feedback_foundation_${suffix}`;

  insertRecommendationExtraction(dbPath, {
    extractionId,
    status: "confirmed",
    promptText: "portrait in soft light --v 6",
    author: "foundation-check",
    creationTime: now,
    sourceJobId: null,
    modelFamily: "standard",
    modelVersion: "6",
    modelSelectionSource: "prompt_flag",
    isBaseline: true,
    hasProfile: false,
    hasSref: false,
    parserVersion: "midjourney-metadata-v1",
    metadataRaw: [{ key: "Description", value: "portrait in soft light --v 6" }],
    createdAt: now,
    confirmedAt: now,
  });

  insertPrompt(dbPath, {
    promptId,
    promptText: "portrait in soft light --v 6",
    status: "active",
    version: "v1",
    curatedFlag: false,
    createdBy: "foundation-check",
    createdAt: now,
  });

  insertRecommendationSession(dbPath, {
    sessionId,
    userId: "foundation-user",
    mode: "precision",
    extractionId,
    promptId,
    status: "succeeded",
    createdAt: now,
    updatedAt: now,
  });

  insertRecommendation(dbPath, {
    recommendationId,
    recommendationSessionId: sessionId,
    rank: 1,
    combinationId: "combo_studio_portrait",
    rationale: "Foundation check recommendation",
    confidence: 0.77,
    riskNotes: [],
    promptImprovements: ["Try adding softer edge lighting."],
    createdAt: now,
  });

  insertPostResultFeedback(dbPath, {
    feedbackId,
    recommendationSessionId: sessionId,
    recommendationId,
    generatedImageId: "img_generated_foundation_001",
    emojiRating: "🙂",
    usefulFlag: true,
    comments: "Result stayed close to expected tone.",
    evidenceStrength: "normal",
    createdBy: "foundation-user",
    createdAt: now,
    updatedAt: now,
  });

  const feedback = getPostResultFeedbackById(dbPath, feedbackId);
  assertCondition(Boolean(feedback), "Expected feedback record to exist");

  insertAlignmentEvaluation(dbPath, {
    alignmentEvaluationId,
    feedbackId,
    alignmentScore: 0.81,
    mismatchSummary: "Minor saturation drift in highlights.",
    suggestedPromptAdjustments: ["Reduce saturation emphasis in highlights."],
    alternativeCombinationIds: ["combo_street_editorial"],
    confidenceDelta: 0.05,
    createdAt: now,
  });

  const alignment = getAlignmentEvaluationByFeedbackId(dbPath, feedbackId);
  assertCondition(Boolean(alignment), "Expected alignment evaluation record to exist");

  const sessionFeedback = listPostResultFeedbackBySessionId(dbPath, sessionId);
  assertCondition(sessionFeedback.length >= 1, "Expected feedback list for session to be non-empty");

  console.log(
    JSON.stringify(
      {
        ok: true,
        sessionId,
        feedbackId,
        alignmentEvaluationId,
        feedbackCountForSession: sessionFeedback.length,
      },
      null,
      2
    )
  );
}

main();
