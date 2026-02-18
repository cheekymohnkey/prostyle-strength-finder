function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const LOW_CONFIDENCE_REASON_CODES = [
  "below_mode_threshold",
  "insufficient_candidates",
  "weak_signal",
];

function isLowConfidenceSignal(value) {
  if (!isObject(value)) {
    return false;
  }

  if (typeof value.isLowConfidence !== "boolean") {
    return false;
  }

  if (!value.isLowConfidence) {
    return true;
  }

  if (typeof value.reasonCode !== "string" || !LOW_CONFIDENCE_REASON_CODES.includes(value.reasonCode)) {
    return false;
  }

  if (typeof value.threshold !== "number" || value.threshold < 0 || value.threshold > 1) {
    return false;
  }

  return true;
}

function isConfidenceRiskBlock(value) {
  if (!isObject(value)) {
    return false;
  }

  if (typeof value.confidence !== "number" || value.confidence < 0 || value.confidence > 1) {
    return false;
  }

  if (!Array.isArray(value.riskNotes)) {
    return false;
  }

  if (!value.riskNotes.every((note) => typeof note === "string")) {
    return false;
  }

  if (value.lowConfidence !== undefined && !isLowConfidenceSignal(value.lowConfidence)) {
    return false;
  }

  return true;
}

function isRecommendationResult(value) {
  if (!isObject(value)) {
    return false;
  }

  if (typeof value.sessionId !== "string" || value.sessionId.trim() === "") {
    return false;
  }

  if (!Array.isArray(value.recommendations)) {
    return false;
  }

  return value.recommendations.every((item) => {
    if (!isObject(item)) {
      return false;
    }

    const hasPromptImprovements = Array.isArray(item.promptImprovements)
      && item.promptImprovements.every((entry) => typeof entry === "string");
    const hasLegacyConfidence = typeof item.confidence === "number"
      && item.confidence >= 0
      && item.confidence <= 1;
    const hasConfidenceRisk = isConfidenceRiskBlock(item.confidenceRisk);

    return (
      Number.isInteger(item.rank) &&
      typeof item.combinationId === "string" &&
      typeof item.rationale === "string" &&
      (hasConfidenceRisk || hasLegacyConfidence) &&
      hasPromptImprovements
    );
  });
}

module.exports = {
  LOW_CONFIDENCE_REASON_CODES,
  isLowConfidenceSignal,
  isConfidenceRiskBlock,
  isRecommendationResult,
};
