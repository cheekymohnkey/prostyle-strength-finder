function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertString(value, key) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid recommendation extraction field: ${key}`);
  }
}

function validateRecommendationExtractionPayload(value) {
  if (!isObject(value)) {
    throw new Error("Recommendation extraction payload must be an object");
  }

  if (!Array.isArray(value.metadataFields) || value.metadataFields.length === 0) {
    throw new Error("Recommendation extraction payload requires metadataFields[]");
  }

  const normalizedFields = value.metadataFields.map((entry, index) => {
    if (!isObject(entry)) {
      throw new Error(`Invalid metadata field entry at index ${index}`);
    }
    assertString(entry.key, `metadataFields[${index}].key`);
    assertString(entry.value, `metadataFields[${index}].value`);
    return {
      key: entry.key.trim(),
      value: entry.value,
    };
  });

  return {
    metadataFields: normalizedFields,
    fileName: typeof value.fileName === "string" ? value.fileName.trim() : null,
    mimeType: typeof value.mimeType === "string" ? value.mimeType.trim() : null,
  };
}

function validateRecommendationExtractionConfirmPayload(value) {
  if (!isObject(value)) {
    throw new Error("Recommendation extraction confirmation payload must be an object");
  }

  if (value.confirmed !== true) {
    throw new Error("Recommendation extraction confirmation requires confirmed=true");
  }

  return {
    confirmed: true,
  };
}

module.exports = {
  validateRecommendationExtractionPayload,
  validateRecommendationExtractionConfirmPayload,
};
