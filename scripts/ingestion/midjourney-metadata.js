const { resolveModelSelection } = require("../models/model-versioning");

const JOB_ID_REGEX = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toFieldMap(metadataFields) {
  const map = new Map();
  for (const entry of metadataFields) {
    const key = String(entry.key || "").trim();
    if (!key) {
      continue;
    }
    map.set(key.toLowerCase(), String(entry.value || ""));
  }
  return map;
}

function parseDescription(descriptionRaw) {
  const description = (descriptionRaw || "").trim();
  const prompt = description.replace(/\s+Job ID:\s*[\s\S]*$/i, "").trim();

  const match = description.match(/Job ID:\s*([0-9a-f-]{36})/i);
  const jobId = match ? match[1].toLowerCase() : null;

  return {
    prompt,
    jobIdFromDescription: jobId,
  };
}

function parseXmpJobId(xmpRaw) {
  const xmp = (xmpRaw || "").trim();
  if (!xmp) {
    return null;
  }

  const guidMatch = xmp.match(/DigImageGUID\s*=\s*"([^"]+)"/i);
  if (guidMatch && JOB_ID_REGEX.test(guidMatch[1])) {
    return guidMatch[1].toLowerCase();
  }

  const genericMatch = xmp.match(JOB_ID_REGEX);
  return genericMatch ? genericMatch[0].toLowerCase() : null;
}

function hasFlag(prompt, regex) {
  return regex.test(prompt);
}

function classifyBaseline(prompt) {
  const hasProfile = hasFlag(prompt, /--p(?:rofile)?\b/i);
  const hasSref = hasFlag(prompt, /--sref\b/i);
  return {
    hasProfile,
    hasSref,
    isBaseline: !hasProfile && !hasSref,
  };
}

function normalizeMidjourneyMetadata(input) {
  if (!isObject(input) || !Array.isArray(input.metadataFields)) {
    throw new Error("normalizeMidjourneyMetadata requires metadataFields[]");
  }

  const map = toFieldMap(input.metadataFields);
  const descriptionRaw = map.get("description") || "";
  if (!descriptionRaw.trim()) {
    throw new Error("Missing required metadata field: Description");
  }

  const { prompt, jobIdFromDescription } = parseDescription(descriptionRaw);
  if (!prompt) {
    throw new Error("Description did not contain a usable prompt");
  }

  const author = (map.get("author") || "").trim() || null;
  const creationTime = (map.get("creation time") || "").trim() || null;
  const xmp = (map.get("xml:com.adobe.xmp") || "").trim() || null;
  const jobIdFromXmp = parseXmpJobId(xmp || "");
  const jobId = jobIdFromDescription || jobIdFromXmp || null;

  const model = resolveModelSelection({ promptText: prompt });
  const baseline = classifyBaseline(prompt);

  return {
    prompt,
    author,
    creationTime,
    jobId,
    modelFamily: model.modelFamily,
    modelVersion: model.modelVersion,
    modelSelectionSource: model.modelSelectionSource,
    isBaseline: baseline.isBaseline,
    hasProfile: baseline.hasProfile,
    hasSref: baseline.hasSref,
    metadataRaw: input.metadataFields.map((entry) => ({
      key: String(entry.key || ""),
      value: String(entry.value || ""),
    })),
    parserVersion: "midjourney-metadata-v1",
  };
}

module.exports = {
  normalizeMidjourneyMetadata,
};
