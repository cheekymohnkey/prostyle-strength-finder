function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertString(value, key) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid post-result feedback field: ${key}`);
  }
}

const FEEDBACK_EMOJI_RATINGS = ["🙂", "☹️"];
const ALLOWED_GENERATED_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];

function validatePostResultFeedbackSubmitPayload(value) {
  if (!isObject(value)) {
    throw new Error("Post-result feedback payload must be an object");
  }

  assertString(value.recommendationSessionId, "recommendationSessionId");
  assertString(value.recommendationId, "recommendationId");

  if (value.emojiRating !== undefined && value.emojiRating !== null) {
    if (typeof value.emojiRating !== "string" || !FEEDBACK_EMOJI_RATINGS.includes(value.emojiRating)) {
      throw new Error(`Invalid post-result feedback field: emojiRating (${value.emojiRating})`);
    }
  }

  if (value.usefulFlag !== undefined && value.usefulFlag !== null && typeof value.usefulFlag !== "boolean") {
    throw new Error("Invalid post-result feedback field: usefulFlag");
  }

  if (value.comments !== undefined && value.comments !== null) {
    if (typeof value.comments !== "string") {
      throw new Error("Invalid post-result feedback field: comments");
    }
    if (value.comments.length > 2000) {
      throw new Error("Invalid post-result feedback field: comments exceeds 2000 chars");
    }
  }

  if (value.generatedImageId !== undefined && value.generatedImageId !== null) {
    assertString(value.generatedImageId, "generatedImageId");
  }

  const hasSignal = Boolean(
    (typeof value.generatedImageId === "string" && value.generatedImageId.trim() !== "")
    || value.emojiRating !== undefined
    || value.usefulFlag !== undefined
    || (typeof value.comments === "string" && value.comments.trim() !== "")
  );
  if (!hasSignal) {
    throw new Error("Post-result feedback payload requires at least one feedback signal");
  }

  return {
    recommendationSessionId: value.recommendationSessionId.trim(),
    recommendationId: value.recommendationId.trim(),
    generatedImageId: typeof value.generatedImageId === "string" ? value.generatedImageId.trim() : null,
    emojiRating: typeof value.emojiRating === "string" ? value.emojiRating : null,
    usefulFlag: typeof value.usefulFlag === "boolean" ? value.usefulFlag : null,
    comments: typeof value.comments === "string" ? value.comments.trim() : null,
  };
}

function validateAlignmentEvaluationEnvelope(value) {
  if (!isObject(value)) {
    throw new Error("Alignment evaluation envelope must be an object");
  }

  assertString(value.feedbackId, "feedbackId");
  if (typeof value.alignmentScore !== "number" || value.alignmentScore < 0 || value.alignmentScore > 1) {
    throw new Error("Invalid alignment evaluation field: alignmentScore");
  }
  assertString(value.mismatchSummary, "mismatchSummary");

  if (!Array.isArray(value.suggestedPromptAdjustments)
    || !value.suggestedPromptAdjustments.every((entry) => typeof entry === "string")) {
    throw new Error("Invalid alignment evaluation field: suggestedPromptAdjustments");
  }

  if (!Array.isArray(value.alternativeCombinationIds)
    || !value.alternativeCombinationIds.every((entry) => typeof entry === "string")) {
    throw new Error("Invalid alignment evaluation field: alternativeCombinationIds");
  }

  if (value.confidenceDelta !== undefined
    && (typeof value.confidenceDelta !== "number" || value.confidenceDelta < -0.25 || value.confidenceDelta > 0.25)) {
    throw new Error("Invalid alignment evaluation field: confidenceDelta");
  }

  return {
    feedbackId: value.feedbackId.trim(),
    alignmentScore: Number(value.alignmentScore.toFixed(3)),
    mismatchSummary: value.mismatchSummary.trim(),
    suggestedPromptAdjustments: value.suggestedPromptAdjustments,
    alternativeCombinationIds: value.alternativeCombinationIds,
    confidenceDelta: value.confidenceDelta === undefined ? 0 : Number(value.confidenceDelta.toFixed(3)),
  };
}

function validateGeneratedImageUploadPayload(value) {
  if (!isObject(value)) {
    throw new Error("Generated image upload payload must be an object");
  }

  assertString(value.recommendationSessionId, "recommendationSessionId");
  assertString(value.fileName, "fileName");
  assertString(value.mimeType, "mimeType");
  assertString(value.fileBase64, "fileBase64");

  const mimeType = value.mimeType.trim().toLowerCase();
  if (!ALLOWED_GENERATED_IMAGE_MIME_TYPES.includes(mimeType)) {
    throw new Error(`Unsupported generated image mimeType: ${value.mimeType}`);
  }

  const fileBase64 = value.fileBase64.trim();
  if (fileBase64.length > 10_000_000) {
    throw new Error("Generated image payload exceeds max base64 length");
  }

  return {
    recommendationSessionId: value.recommendationSessionId.trim(),
    fileName: value.fileName.trim(),
    mimeType,
    fileBase64,
  };
}

function validateFeedbackEvaluationPayload(value) {
  return validatePostResultFeedbackSubmitPayload(value);
}

module.exports = {
  FEEDBACK_EMOJI_RATINGS,
  ALLOWED_GENERATED_IMAGE_MIME_TYPES,
  validatePostResultFeedbackSubmitPayload,
  validateAlignmentEvaluationEnvelope,
  validateGeneratedImageUploadPayload,
  validateFeedbackEvaluationPayload,
};
