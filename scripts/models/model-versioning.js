const MODEL_FAMILIES = ["standard", "niji"];

const DEFAULT_MODEL_VERSIONS = {
  standard: "7",
  niji: "7",
};

let currentDefaultModelVersions = { ...DEFAULT_MODEL_VERSIONS };

function assertVersion(value, key) {
  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) {
    throw new Error(`Invalid ${key}: expected integer-like string`);
  }
  const normalized = String(Number.parseInt(value.trim(), 10));
  if (normalized === "0") {
    throw new Error(`Invalid ${key}: must be >= 1`);
  }
  return normalized;
}

function assertModelFamily(value, key) {
  if (typeof value !== "string") {
    throw new Error(`Invalid ${key}: expected string`);
  }
  const normalized = value.trim().toLowerCase();
  if (!MODEL_FAMILIES.includes(normalized)) {
    throw new Error(`Invalid ${key}: ${value}`);
  }
  return normalized;
}

function setCurrentDefaultModels(input) {
  if (!input || typeof input !== "object") {
    throw new Error("setCurrentDefaultModels requires an object");
  }

  const standard = assertVersion(input.standard, "default standard model version");
  const niji = assertVersion(input.niji, "default niji model version");

  currentDefaultModelVersions = {
    standard,
    niji,
  };

  return getCurrentDefaultModels();
}

function getCurrentDefaultModels() {
  return { ...currentDefaultModelVersions };
}

function parsePromptModelSelection(promptText) {
  const defaults = getCurrentDefaultModels();
  const prompt = typeof promptText === "string" ? promptText : "";

  const nijiMatch = prompt.match(/--niji(?:\s+(\d+))?/i);
  const versionMatch = prompt.match(/--v(?:\s+(\d+))?/i);

  if (nijiMatch && versionMatch) {
    throw new Error("Prompt cannot include both --niji and --v");
  }

  if (nijiMatch) {
    if (!nijiMatch[1]) {
      throw new Error("Prompts using --niji must include a version (for example: --niji 7)");
    }
    return {
      modelFamily: "niji",
      modelVersion: assertVersion(nijiMatch[1], "niji model version"),
      modelSelectionSource: "explicit_prompt_niji",
    };
  }

  if (versionMatch) {
    if (!versionMatch[1]) {
      throw new Error("Prompts using --v must include a version (for example: --v 7)");
    }
    return {
      modelFamily: "standard",
      modelVersion: assertVersion(versionMatch[1], "standard model version"),
      modelSelectionSource: "explicit_prompt_standard",
    };
  }

  return {
    modelFamily: "standard",
    modelVersion: defaults.standard,
    modelSelectionSource: "default_standard_current",
  };
}

function resolveModelSelection(input) {
  const value = input || {};

  if (value.modelFamily !== undefined || value.modelVersion !== undefined) {
    if (value.modelFamily === undefined || value.modelVersion === undefined) {
      throw new Error("modelFamily and modelVersion must be provided together");
    }

    return {
      modelFamily: assertModelFamily(value.modelFamily, "modelFamily"),
      modelVersion: assertVersion(value.modelVersion, "modelVersion"),
      modelSelectionSource:
        typeof value.modelSelectionSource === "string" && value.modelSelectionSource.trim() !== ""
          ? value.modelSelectionSource.trim()
          : "explicit_envelope",
    };
  }

  return parsePromptModelSelection(value.promptText);
}

module.exports = {
  MODEL_FAMILIES,
  DEFAULT_MODEL_VERSIONS,
  setCurrentDefaultModels,
  getCurrentDefaultModels,
  parsePromptModelSelection,
  resolveModelSelection,
};
