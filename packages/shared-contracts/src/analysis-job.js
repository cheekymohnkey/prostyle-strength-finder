const ANALYSIS_RUN_TYPES = ["trait", "recommendation", "alignment"];

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertString(value, key) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid analysis job field: ${key}`);
  }
}

function validateAnalysisJobEnvelope(value) {
  if (!isObject(value)) {
    throw new Error("Analysis job envelope must be an object");
  }

  assertString(value.schemaVersion, "schemaVersion");
  assertString(value.jobId, "jobId");
  assertString(value.idempotencyKey, "idempotencyKey");
  assertString(value.runType, "runType");
  assertString(value.imageId, "imageId");
  assertString(value.submittedAt, "submittedAt");

  if (!ANALYSIS_RUN_TYPES.includes(value.runType)) {
    throw new Error(`Invalid runType: ${value.runType}`);
  }

  if (value.priority !== undefined && !["low", "normal", "high"].includes(value.priority)) {
    throw new Error(`Invalid priority: ${value.priority}`);
  }

  if (value.context !== undefined && !isObject(value.context)) {
    throw new Error("Invalid analysis job field: context");
  }

  return value;
}

function parseAnalysisJobEnvelope(input) {
  const value = typeof input === "string" ? JSON.parse(input) : input;
  return validateAnalysisJobEnvelope(value);
}

module.exports = {
  ANALYSIS_RUN_TYPES,
  parseAnalysisJobEnvelope,
  validateAnalysisJobEnvelope,
};
