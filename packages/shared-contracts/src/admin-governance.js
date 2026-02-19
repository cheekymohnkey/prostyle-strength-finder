const STYLE_INFLUENCE_GOVERNANCE_ACTIONS = ["disable", "pin", "unpin", "remove"];
const ANALYSIS_MODERATION_ACTIONS = ["flag", "remove", "re-run"];

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertString(value, key) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid governance field: ${key}`);
  }
}

function validateStyleInfluenceGovernancePayload(value) {
  if (!isObject(value)) {
    throw new Error("Style influence governance payload must be an object");
  }

  assertString(value.action, "action");
  if (!STYLE_INFLUENCE_GOVERNANCE_ACTIONS.includes(value.action.trim())) {
    throw new Error(`Invalid governance action: ${value.action}`);
  }

  assertString(value.reason, "reason");

  return {
    action: value.action.trim(),
    reason: value.reason.trim(),
  };
}

function validateAnalysisModerationPayload(value) {
  if (!isObject(value)) {
    throw new Error("Analysis moderation payload must be an object");
  }

  assertString(value.action, "action");
  if (!ANALYSIS_MODERATION_ACTIONS.includes(value.action.trim())) {
    throw new Error(`Invalid moderation action: ${value.action}`);
  }

  assertString(value.reason, "reason");

  return {
    action: value.action.trim(),
    reason: value.reason.trim(),
  };
}

module.exports = {
  STYLE_INFLUENCE_GOVERNANCE_ACTIONS,
  ANALYSIS_MODERATION_ACTIONS,
  validateStyleInfluenceGovernancePayload,
  validateAnalysisModerationPayload,
};
