function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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

    return (
      Number.isInteger(item.rank) &&
      typeof item.combinationId === "string" &&
      typeof item.rationale === "string" &&
      typeof item.confidence === "number" &&
      item.confidence >= 0 &&
      item.confidence <= 1
    );
  });
}

module.exports = {
  isRecommendationResult,
};
