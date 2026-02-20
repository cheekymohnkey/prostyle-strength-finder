const STYLE_INFLUENCE_GOVERNANCE_ACTIONS = ["disable", "pin", "unpin", "remove"];
const ANALYSIS_MODERATION_ACTIONS = ["flag", "remove", "re-run"];
const ANALYSIS_APPROVAL_ACTIONS = ["approve", "reject"];
const PROMPT_CURATION_STATUSES = ["active", "deprecated", "experimental"];
const APPROVAL_MODES = ["auto-approve", "manual"];

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

function validatePromptCurationPayload(value) {
  if (!isObject(value)) {
    throw new Error("Prompt curation payload must be an object");
  }

  assertString(value.status, "status");
  if (!PROMPT_CURATION_STATUSES.includes(value.status.trim())) {
    throw new Error(`Invalid prompt curation status: ${value.status}`);
  }

  assertString(value.reason, "reason");

  return {
    status: value.status.trim(),
    reason: value.reason.trim(),
  };
}

function validateApprovalPolicyPayload(value) {
  if (!isObject(value)) {
    throw new Error("Approval policy payload must be an object");
  }

  assertString(value.approvalMode, "approvalMode");
  if (!APPROVAL_MODES.includes(value.approvalMode.trim())) {
    throw new Error(`Invalid approval mode: ${value.approvalMode}`);
  }

  assertString(value.reason, "reason");

  return {
    approvalMode: value.approvalMode.trim(),
    reason: value.reason.trim(),
  };
}

function validateAnalysisApprovalPayload(value) {
  if (!isObject(value)) {
    throw new Error("Analysis approval payload must be an object");
  }

  assertString(value.action, "action");
  if (!ANALYSIS_APPROVAL_ACTIONS.includes(value.action.trim())) {
    throw new Error(`Invalid analysis approval action: ${value.action}`);
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
  ANALYSIS_APPROVAL_ACTIONS,
  PROMPT_CURATION_STATUSES,
  APPROVAL_MODES,
  validateStyleInfluenceGovernancePayload,
  validateAnalysisModerationPayload,
  validatePromptCurationPayload,
  validateApprovalPolicyPayload,
  validateAnalysisApprovalPayload,
};
