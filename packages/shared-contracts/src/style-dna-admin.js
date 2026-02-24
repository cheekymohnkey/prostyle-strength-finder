const STYLE_DNA_STYLIZE_TIERS = [0, 100, 1000];
const STYLE_DNA_ADJUSTMENT_TYPES = ["sref", "profile"];
const STYLE_DNA_IMAGE_KINDS = ["baseline", "test"];
const STYLE_DNA_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];

const STYLIZE_TIER_SET = new Set(STYLE_DNA_STYLIZE_TIERS);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertRequiredString(value, key) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${key} is required`);
  }
  return value.trim();
}

function parseIntegerField(value, fieldName) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${fieldName} must be an integer`);
  }
  return parsed;
}

function ensureAllowedStylizeTier(value, fieldName) {
  if (!STYLIZE_TIER_SET.has(value)) {
    throw new Error(`${fieldName} must be one of: 0, 100, 1000`);
  }
  return value;
}

function validateStyleDnaBaselineSetPayload(value) {
  if (!isObject(value)) {
    throw new Error("Style-DNA baseline payload must be an object");
  }
  const mjModelFamily = assertRequiredString(value.mjModelFamily, "mjModelFamily");
  const mjModelVersion = assertRequiredString(value.mjModelVersion, "mjModelVersion");
  const suiteId = assertRequiredString(value.suiteId, "suiteId");
  if (!isObject(value.parameterEnvelope)) {
    throw new Error("parameterEnvelope must be an object");
  }

  if (value.parameterEnvelope.stylizeTier !== undefined) {
    ensureAllowedStylizeTier(
      parseIntegerField(value.parameterEnvelope.stylizeTier, "parameterEnvelope.stylizeTier"),
      "parameterEnvelope.stylizeTier"
    );
  }

  return {
    mjModelFamily,
    mjModelVersion,
    suiteId,
    parameterEnvelope: value.parameterEnvelope,
  };
}

function validateStyleDnaBaselineSetItemPayload(value) {
  if (!isObject(value)) {
    throw new Error("Style-DNA baseline item payload must be an object");
  }
  const promptKey = assertRequiredString(value.promptKey, "promptKey");
  const gridImageId = assertRequiredString(value.gridImageId, "gridImageId");
  const stylizeTier = ensureAllowedStylizeTier(
    value.stylizeTier === undefined ? 100 : parseIntegerField(value.stylizeTier, "stylizeTier"),
    "stylizeTier"
  );

  return {
    promptKey,
    gridImageId,
    stylizeTier,
  };
}

function validateStyleDnaPromptJobPayload(value) {
  if (!isObject(value)) {
    throw new Error("Style-DNA prompt job payload must be an object");
  }
  const styleInfluenceId = assertRequiredString(value.styleInfluenceId, "styleInfluenceId");
  const baselineRenderSetId = assertRequiredString(value.baselineRenderSetId, "baselineRenderSetId");
  if (!Array.isArray(value.stylizeTiers) || value.stylizeTiers.length === 0) {
    throw new Error("stylizeTiers must be a non-empty array");
  }
  const styleAdjustmentType = typeof value.styleAdjustmentType === "string"
    ? value.styleAdjustmentType.trim()
    : "";
  if (!STYLE_DNA_ADJUSTMENT_TYPES.includes(styleAdjustmentType)) {
    throw new Error("styleAdjustmentType must be one of: sref, profile");
  }
  const styleAdjustmentMidjourneyId = assertRequiredString(value.styleAdjustmentMidjourneyId, "styleAdjustmentMidjourneyId");
  const stylizeTiers = value.stylizeTiers.map((tier) => ensureAllowedStylizeTier(
    parseIntegerField(tier, "stylizeTier"),
    "stylizeTier"
  ));

  return {
    styleInfluenceId,
    baselineRenderSetId,
    styleAdjustmentType,
    styleAdjustmentMidjourneyId,
    stylizeTiers,
  };
}

function validateStyleDnaRunPayload(value) {
  if (!isObject(value)) {
    throw new Error("Style-DNA run payload must be an object");
  }
  const styleInfluenceId = assertRequiredString(value.styleInfluenceId, "styleInfluenceId");
  const baselineRenderSetId = assertRequiredString(value.baselineRenderSetId, "baselineRenderSetId");
  const promptKey = assertRequiredString(value.promptKey, "promptKey");
  const testGridImageId = assertRequiredString(value.testGridImageId, "testGridImageId");
  const styleAdjustmentType = typeof value.styleAdjustmentType === "string"
    ? value.styleAdjustmentType.trim()
    : "";
  if (!STYLE_DNA_ADJUSTMENT_TYPES.includes(styleAdjustmentType)) {
    throw new Error("styleAdjustmentType must be one of: sref, profile");
  }
  const styleAdjustmentMidjourneyId = assertRequiredString(value.styleAdjustmentMidjourneyId, "styleAdjustmentMidjourneyId");
  const stylizeTier = ensureAllowedStylizeTier(
    parseIntegerField(value.stylizeTier, "stylizeTier"),
    "stylizeTier"
  );

  return {
    idempotencyKey: typeof value.idempotencyKey === "string" && value.idempotencyKey.trim() !== ""
      ? value.idempotencyKey.trim()
      : null,
    styleInfluenceId,
    baselineRenderSetId,
    styleAdjustmentType,
    styleAdjustmentMidjourneyId,
    promptKey,
    stylizeTier,
    testGridImageId,
  };
}

function validateStyleDnaImageUploadPayload(value) {
  if (!isObject(value)) {
    throw new Error("Style-DNA image upload payload must be an object");
  }
  const imageKind = typeof value.imageKind === "string" ? value.imageKind.trim() : "";
  if (!STYLE_DNA_IMAGE_KINDS.includes(imageKind)) {
    throw new Error("imageKind must be baseline or test");
  }
  const fileName = assertRequiredString(value.fileName, "fileName");
  const mimeType = typeof value.mimeType === "string" ? value.mimeType.trim() : "";
  if (!STYLE_DNA_IMAGE_MIME_TYPES.includes(mimeType)) {
    throw new Error("mimeType must be image/png, image/jpeg, or image/webp");
  }
  const fileBase64 = assertRequiredString(value.fileBase64, "fileBase64");
  return {
    imageKind,
    fileName,
    mimeType,
    fileBase64,
  };
}

module.exports = {
  STYLE_DNA_STYLIZE_TIERS,
  STYLE_DNA_ADJUSTMENT_TYPES,
  STYLE_DNA_IMAGE_KINDS,
  STYLE_DNA_IMAGE_MIME_TYPES,
  validateStyleDnaBaselineSetPayload,
  validateStyleDnaBaselineSetItemPayload,
  validateStyleDnaPromptJobPayload,
  validateStyleDnaRunPayload,
  validateStyleDnaImageUploadPayload,
};
