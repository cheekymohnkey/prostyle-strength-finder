const STYLE_DNA_STYLIZE_TIERS = [0, 100, 1000];
const STYLE_DNA_ADJUSTMENT_TYPES = ["sref", "profile"];
const STYLE_DNA_IMAGE_KINDS = ["baseline", "test"];
const STYLE_DNA_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];
const STYLE_DNA_TRAIT_AXES = [
  "composition_and_structure",
  "lighting_and_contrast",
  "color_palette",
  "texture_and_medium",
  "dominant_dna_tags",
];
const STYLE_DNA_CANONICAL_STATUSES = ["active", "deprecated"];

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
  if (!isObject(value.submittedTestEnvelope)) {
    throw new Error("submittedTestEnvelope must be an object");
  }
  const submittedTestEnvelope = value.submittedTestEnvelope;
  const submittedMjModelFamily = assertRequiredString(submittedTestEnvelope.mjModelFamily, "submittedTestEnvelope.mjModelFamily");
  const submittedMjModelVersion = assertRequiredString(submittedTestEnvelope.mjModelVersion, "submittedTestEnvelope.mjModelVersion");
  const submittedStylizeTier = ensureAllowedStylizeTier(
    parseIntegerField(submittedTestEnvelope.stylizeTier, "submittedTestEnvelope.stylizeTier"),
    "submittedTestEnvelope.stylizeTier"
  );
  const normalizeOptionalScalar = (fieldName, rawValue) => {
    if (rawValue === undefined || rawValue === null || String(rawValue).trim() === "") {
      return null;
    }
    return String(rawValue).trim();
  };
  const submittedStyleRaw = submittedTestEnvelope.styleRaw;
  if (submittedStyleRaw !== undefined && typeof submittedStyleRaw !== "boolean") {
    throw new Error("submittedTestEnvelope.styleRaw must be boolean when provided");
  }
  let submittedStyleWeight = null;
  if (submittedTestEnvelope.styleWeight !== undefined && submittedTestEnvelope.styleWeight !== null && String(submittedTestEnvelope.styleWeight).trim() !== "") {
    const parsedStyleWeight = Number(submittedTestEnvelope.styleWeight);
    if (!Number.isFinite(parsedStyleWeight)) {
      throw new Error("submittedTestEnvelope.styleWeight must be numeric when provided");
    }
    submittedStyleWeight = parsedStyleWeight;
  }
  if (styleAdjustmentType === "sref" && submittedStyleWeight === null) {
    throw new Error("submittedTestEnvelope.styleWeight is required for sref runs");
  }
  if (styleAdjustmentType === "profile" && submittedStyleWeight !== null) {
    throw new Error("submittedTestEnvelope.styleWeight is not allowed for profile runs");
  }
  if (submittedStylizeTier !== stylizeTier) {
    throw new Error("submittedTestEnvelope.stylizeTier must match stylizeTier");
  }

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
    submittedTestEnvelope: {
      mjModelFamily: submittedMjModelFamily,
      mjModelVersion: submittedMjModelVersion,
      seed: normalizeOptionalScalar("submittedTestEnvelope.seed", submittedTestEnvelope.seed),
      quality: normalizeOptionalScalar("submittedTestEnvelope.quality", submittedTestEnvelope.quality),
      aspectRatio: normalizeOptionalScalar("submittedTestEnvelope.aspectRatio", submittedTestEnvelope.aspectRatio),
      styleRaw: submittedStyleRaw === undefined ? null : submittedStyleRaw,
      stylizeTier: submittedStylizeTier,
      styleWeight: submittedStyleWeight,
    },
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

function validateStyleDnaCanonicalTraitCreatePayload(value) {
  if (!isObject(value)) {
    throw new Error("Style-DNA canonical trait payload must be an object");
  }
  const taxonomyVersion = value.taxonomyVersion === undefined
    ? "style_dna_v1"
    : assertRequiredString(value.taxonomyVersion, "taxonomyVersion");
  const axis = assertRequiredString(value.axis, "axis");
  if (!STYLE_DNA_TRAIT_AXES.includes(axis)) {
    throw new Error("axis must be one of: composition_and_structure, lighting_and_contrast, color_palette, texture_and_medium, dominant_dna_tags");
  }
  const displayLabel = assertRequiredString(value.displayLabel, "displayLabel");
  const notes = typeof value.notes === "string" && value.notes.trim() !== ""
    ? value.notes.trim()
    : null;
  return {
    taxonomyVersion,
    axis,
    displayLabel,
    notes,
  };
}

function validateStyleDnaCanonicalTraitStatusPayload(value) {
  if (!isObject(value)) {
    throw new Error("Style-DNA canonical trait status payload must be an object");
  }
  const status = assertRequiredString(value.status, "status");
  if (!STYLE_DNA_CANONICAL_STATUSES.includes(status)) {
    throw new Error("status must be one of: active, deprecated");
  }
  const note = typeof value.note === "string" && value.note.trim() !== ""
    ? value.note.trim()
    : null;
  return {
    status,
    note,
  };
}

function validateStyleDnaTraitAliasCreatePayload(value) {
  if (!isObject(value)) {
    throw new Error("Style-DNA trait alias payload must be an object");
  }
  const taxonomyVersion = value.taxonomyVersion === undefined
    ? "style_dna_v1"
    : assertRequiredString(value.taxonomyVersion, "taxonomyVersion");
  const axis = assertRequiredString(value.axis, "axis");
  if (!STYLE_DNA_TRAIT_AXES.includes(axis)) {
    throw new Error("axis must be one of: composition_and_structure, lighting_and_contrast, color_palette, texture_and_medium, dominant_dna_tags");
  }
  const aliasText = assertRequiredString(value.aliasText, "aliasText");
  const canonicalTraitId = assertRequiredString(value.canonicalTraitId, "canonicalTraitId");
  const note = typeof value.note === "string" && value.note.trim() !== ""
    ? value.note.trim()
    : null;
  return {
    taxonomyVersion,
    axis,
    aliasText,
    canonicalTraitId,
    note,
  };
}

function validateStyleDnaTraitAliasStatusPayload(value) {
  if (!isObject(value)) {
    throw new Error("Style-DNA trait alias status payload must be an object");
  }
  const status = assertRequiredString(value.status, "status");
  if (!STYLE_DNA_CANONICAL_STATUSES.includes(status)) {
    throw new Error("status must be one of: active, deprecated");
  }
  const note = typeof value.note === "string" && value.note.trim() !== ""
    ? value.note.trim()
    : null;
  return {
    status,
    note,
  };
}

module.exports = {
  STYLE_DNA_STYLIZE_TIERS,
  STYLE_DNA_ADJUSTMENT_TYPES,
  STYLE_DNA_IMAGE_KINDS,
  STYLE_DNA_IMAGE_MIME_TYPES,
  STYLE_DNA_TRAIT_AXES,
  STYLE_DNA_CANONICAL_STATUSES,
  validateStyleDnaBaselineSetPayload,
  validateStyleDnaBaselineSetItemPayload,
  validateStyleDnaPromptJobPayload,
  validateStyleDnaRunPayload,
  validateStyleDnaImageUploadPayload,
  validateStyleDnaCanonicalTraitCreatePayload,
  validateStyleDnaCanonicalTraitStatusPayload,
  validateStyleDnaTraitAliasCreatePayload,
  validateStyleDnaTraitAliasStatusPayload,
};
