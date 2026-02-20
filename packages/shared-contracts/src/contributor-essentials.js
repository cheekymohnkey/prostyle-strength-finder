const CONTRIBUTOR_SUBMISSION_INFLUENCE_TYPES = ["profile", "sref"];

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertString(value, key) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid contributor field: ${key}`);
  }
}

function validateContributorSubmissionCreatePayload(value) {
  if (!isObject(value)) {
    throw new Error("Contributor submission payload must be an object");
  }

  assertString(value.influenceType, "influenceType");
  if (!CONTRIBUTOR_SUBMISSION_INFLUENCE_TYPES.includes(value.influenceType.trim())) {
    throw new Error(`Invalid contributor influenceType: ${value.influenceType}`);
  }

  assertString(value.influenceCode, "influenceCode");
  assertString(value.sourceImageId, "sourceImageId");

  return {
    influenceType: value.influenceType.trim(),
    influenceCode: value.influenceCode.trim(),
    sourceImageId: value.sourceImageId.trim(),
  };
}

function validateContributorSubmissionTriggerPayload(value) {
  if (!isObject(value)) {
    throw new Error("Contributor trigger payload must be an object");
  }

  let promptText = "";
  if (value.promptText !== undefined) {
    assertString(value.promptText, "promptText");
    promptText = value.promptText.trim();
  }

  return {
    promptText,
  };
}

module.exports = {
  CONTRIBUTOR_SUBMISSION_INFLUENCE_TYPES,
  validateContributorSubmissionCreatePayload,
  validateContributorSubmissionTriggerPayload,
};
