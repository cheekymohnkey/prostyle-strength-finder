const { normalizeTraitText } = require("../inference/style-dna-canonicalizer");
const crypto = require("crypto");
const { STYLE_DNA_TRAIT_AXES } = require("../../packages/shared-contracts/src");

function compareByKey(a, b) {
  return String(a || "").localeCompare(String(b || ""));
}

function toDeterministicJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => toDeterministicJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort(compareByKey);
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${toDeterministicJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function buildSeedCoverageReport(payload, options = {}) {
  const taxonomyVersion = String(payload?.taxonomyVersion || "style_dna_v1").trim() || "style_dna_v1";
  const minCanonicalPerAxis = Number.isInteger(options.minCanonicalPerAxis)
    ? options.minCanonicalPerAxis
    : 2;
  const minAliasesPerAxis = Number.isInteger(options.minAliasesPerAxis)
    ? options.minAliasesPerAxis
    : 3;

  const countsByAxis = {};
  STYLE_DNA_TRAIT_AXES.forEach((axis) => {
    countsByAxis[axis] = {
      canonicalNormalized: new Set(),
      aliasesNormalized: new Set(),
    };
  });

  const entries = Array.isArray(payload?.entries) ? payload.entries : [];
  entries.forEach((entry) => {
    const axis = String(entry?.axis || "").trim();
    if (!STYLE_DNA_TRAIT_AXES.includes(axis)) {
      return;
    }
    const normalizedLabel = normalizeTraitText(entry.displayLabel);
    if (normalizedLabel) {
      countsByAxis[axis].canonicalNormalized.add(normalizedLabel);
    }
    const aliases = Array.isArray(entry?.aliases) ? entry.aliases : [];
    aliases.forEach((aliasText) => {
      const normalizedAlias = normalizeTraitText(aliasText);
      if (normalizedAlias) {
        countsByAxis[axis].aliasesNormalized.add(normalizedAlias);
      }
    });
  });

  const coverageByAxis = {};
  const deficits = [];
  STYLE_DNA_TRAIT_AXES.forEach((axis) => {
    const canonicalCount = countsByAxis[axis].canonicalNormalized.size;
    const aliasCount = countsByAxis[axis].aliasesNormalized.size;
    const canonicalDeficit = Math.max(0, minCanonicalPerAxis - canonicalCount);
    const aliasDeficit = Math.max(0, minAliasesPerAxis - aliasCount);
    coverageByAxis[axis] = {
      canonicalCount,
      aliasCount,
      minCanonicalRequired: minCanonicalPerAxis,
      minAliasRequired: minAliasesPerAxis,
      canonicalDeficit,
      aliasDeficit,
      meetsCoverage: canonicalDeficit === 0 && aliasDeficit === 0,
    };
    if (canonicalDeficit > 0 || aliasDeficit > 0) {
      deficits.push({
        axis,
        canonicalCount,
        aliasCount,
        minCanonicalRequired: minCanonicalPerAxis,
        minAliasRequired: minAliasesPerAxis,
        canonicalDeficit,
        aliasDeficit,
      });
    }
  });

  const summaryByAxis = STYLE_DNA_TRAIT_AXES.map((axis) => ({
    axis,
    canonicalCount: coverageByAxis[axis].canonicalCount,
    aliasCount: coverageByAxis[axis].aliasCount,
    canonicalDeficit: coverageByAxis[axis].canonicalDeficit,
    aliasDeficit: coverageByAxis[axis].aliasDeficit,
    meetsCoverage: coverageByAxis[axis].meetsCoverage,
  }));

  const totals = {
    axisCount: STYLE_DNA_TRAIT_AXES.length,
    coveredAxisCount: summaryByAxis.filter((row) => row.meetsCoverage).length,
    uncoveredAxisCount: summaryByAxis.filter((row) => !row.meetsCoverage).length,
    totalCanonicalCount: summaryByAxis.reduce((sum, row) => sum + row.canonicalCount, 0),
    totalAliasCount: summaryByAxis.reduce((sum, row) => sum + row.aliasCount, 0),
  };

  const baseReport = {
    taxonomyVersion,
    thresholds: {
      minCanonicalPerAxis,
      minAliasesPerAxis,
    },
    coverageByAxis,
    summaryByAxis,
    totals,
    deficits,
    ok: deficits.length === 0,
  };

  const reportSignature = sha256Hex(toDeterministicJson(baseReport));

  return {
    ...baseReport,
    reportSignature,
  };
}

module.exports = {
  buildSeedCoverageReport,
};
