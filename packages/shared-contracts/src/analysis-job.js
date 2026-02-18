const ANALYSIS_RUN_TYPES = ["trait", "recommendation", "alignment"];
const MODEL_FAMILIES = ["standard", "niji"];

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
  assertString(value.modelFamily, "modelFamily");
  assertString(value.modelVersion, "modelVersion");
  assertString(value.modelSelectionSource, "modelSelectionSource");

  if (!ANALYSIS_RUN_TYPES.includes(value.runType)) {
    throw new Error(`Invalid runType: ${value.runType}`);
  }

  if (!MODEL_FAMILIES.includes(value.modelFamily)) {
    throw new Error(`Invalid modelFamily: ${value.modelFamily}`);
  }

  if (!/^\d+$/.test(value.modelVersion)) {
    throw new Error(`Invalid modelVersion: ${value.modelVersion}`);
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
  MODEL_FAMILIES,
  parseAnalysisJobEnvelope,
  validateAnalysisJobEnvelope,
};
