const RECOMMENDATION_MODES = ["precision", "close_enough"];

const RECOMMENDATION_SESSION_STATUSES = [
  "extracted",
  "confirmed",
  "processing",
  "succeeded",
  "failed",
];

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertString(value, key) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid recommendation session field: ${key}`);
  }
}

function validateRecommendationSubmitPayload(value) {
  if (!isObject(value)) {
    throw new Error("Recommendation submit payload must be an object");
  }

  assertString(value.extractionId, "extractionId");
  assertString(value.mode, "mode");

  if (!RECOMMENDATION_MODES.includes(value.mode)) {
    throw new Error(`Invalid recommendation mode: ${value.mode}`);
  }

  if (value.confirmed !== true) {
    throw new Error("Recommendation submit payload requires confirmed=true");
  }

  return {
    extractionId: value.extractionId.trim(),
    mode: value.mode,
    confirmed: true,
  };
}

function validateRecommendationSessionEnvelope(value) {
  if (!isObject(value)) {
    throw new Error("Recommendation session envelope must be an object");
  }

  assertString(value.sessionId, "sessionId");
  assertString(value.extractionId, "extractionId");
  assertString(value.mode, "mode");
  assertString(value.status, "status");
  assertString(value.createdAt, "createdAt");

  if (!RECOMMENDATION_MODES.includes(value.mode)) {
    throw new Error(`Invalid recommendation mode: ${value.mode}`);
  }

  if (!RECOMMENDATION_SESSION_STATUSES.includes(value.status)) {
    throw new Error(`Invalid recommendation session status: ${value.status}`);
  }

  return value;
}

module.exports = {
  RECOMMENDATION_MODES,
  RECOMMENDATION_SESSION_STATUSES,
  validateRecommendationSubmitPayload,
  validateRecommendationSessionEnvelope,
};
