const crypto = require("crypto");
const {
  listActiveStyleDnaCanonicalTraits,
  listActiveStyleDnaTraitAliases,
  insertStyleDnaTraitAlias,
  getPendingStyleDnaTraitDiscoveryByNormalized,
  insertStyleDnaTraitDiscovery,
  updateStyleDnaTraitDiscoveryObservation,
} = require("../db/repository");

const DEFAULT_TAXONOMY_VERSION = "style_dna_v1";
const DEFAULT_LEXICAL_THRESHOLD = 0.7;
const DEFAULT_SEMANTIC_THRESHOLD = 0.88;
const TRAIT_AXES = [
  "composition_and_structure",
  "lighting_and_contrast",
  "color_palette",
  "texture_and_medium",
];
const VAGUE_LABEL_DENYLIST = new Set([
  "style",
  "quality",
  "nice lighting",
  "good lighting",
  "good color",
  "good colors",
]);

function normalizeTraitText(value) {
  if (typeof value !== "string") {
    return "";
  }
  const base = value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
  if (base.length > 3 && base.endsWith("s") && !base.endsWith("ss")) {
    return base.slice(0, -1);
  }
  return base;
}

function tokenize(normalized) {
  if (!normalized) {
    return [];
  }
  return normalized.split(" ").filter(Boolean);
}

function lexicalSimilarity(a, b) {
  const tokensA = new Set(tokenize(a));
  const tokensB = new Set(tokenize(b));
  if (tokensA.size === 0 || tokensB.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) {
      intersection += 1;
    }
  }
  const union = tokensA.size + tokensB.size - intersection;
  if (union <= 0) {
    return 0;
  }
  return intersection / union;
}

function trigramCounts(normalized) {
  const source = `  ${normalized}  `;
  const counts = new Map();
  for (let i = 0; i < source.length - 2; i += 1) {
    const gram = source.slice(i, i + 3);
    counts.set(gram, Number(counts.get(gram) || 0) + 1);
  }
  return counts;
}

function semanticProxySimilarity(a, b) {
  if (!a || !b) {
    return 0;
  }
  const aCounts = trigramCounts(a);
  const bCounts = trigramCounts(b);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const value of aCounts.values()) {
    normA += value * value;
  }
  for (const value of bCounts.values()) {
    normB += value * value;
  }
  for (const [gram, value] of aCounts.entries()) {
    dot += value * Number(bCounts.get(gram) || 0);
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function buildTraitLookups(canonicalRows, aliasRows) {
  const canonicalByAxis = new Map();
  const aliasByAxis = new Map();

  canonicalRows.forEach((row) => {
    if (!canonicalByAxis.has(row.axis)) {
      canonicalByAxis.set(row.axis, []);
    }
    canonicalByAxis.get(row.axis).push(row);
  });

  aliasRows.forEach((row) => {
    if (!aliasByAxis.has(row.axis)) {
      aliasByAxis.set(row.axis, new Map());
    }
    aliasByAxis.get(row.axis).set(row.normalized_alias, row);
  });

  return {
    canonicalByAxis,
    aliasByAxis,
  };
}

function topCandidates(canonicalRows, normalizedTrait, maxCount = 3) {
  return canonicalRows
    .map((row) => {
      const lexical = lexicalSimilarity(normalizedTrait, row.normalized_label);
      const semantic = semanticProxySimilarity(normalizedTrait, row.normalized_label);
      return {
        canonicalTraitId: row.canonical_trait_id,
        displayLabel: row.display_label,
        lexicalSimilarity: Number(lexical.toFixed(3)),
        semanticSimilarity: Number(semantic.toFixed(3)),
      };
    })
    .sort((a, b) => (
      b.semanticSimilarity - a.semanticSimilarity
      || b.lexicalSimilarity - a.lexicalSimilarity
      || String(a.displayLabel).localeCompare(String(b.displayLabel))
    ))
    .slice(0, maxCount);
}

function resolveByCanonicalMatch(canonicalRows, normalizedTrait) {
  return canonicalRows.find((row) => row.normalized_label === normalizedTrait) || null;
}

function shouldAutoMerge(candidate, lexicalThreshold, semanticThreshold) {
  if (!candidate) {
    return false;
  }
  return candidate.lexicalSimilarity >= lexicalThreshold
    && candidate.semanticSimilarity >= semanticThreshold;
}

function isNoChange(value) {
  return String(value || "").trim().toLowerCase() === "no change";
}

function addDiscoveryRecord(dbPath, {
  taxonomyVersion,
  axis,
  rawTraitText,
  normalizedTrait,
  candidates,
  styleDnaRunId,
  analysisRunId,
}) {
  const existing = getPendingStyleDnaTraitDiscoveryByNormalized(dbPath, {
    taxonomyVersion,
    axis,
    normalizedTrait,
  });
  if (existing) {
    updateStyleDnaTraitDiscoveryObservation(dbPath, existing.discovery_id, {
      rawTraitText,
      lastSeenAt: new Date().toISOString(),
      seenCountIncrement: 1,
      latestStyleDnaRunId: styleDnaRunId,
      latestAnalysisRunId: analysisRunId,
      topCandidates: candidates,
    });
    return existing.discovery_id;
  }

  const discoveryId = `sdt_disc_${crypto.randomUUID()}`;
  insertStyleDnaTraitDiscovery(dbPath, {
    discoveryId,
    taxonomyVersion,
    axis,
    rawTraitText,
    normalizedTrait,
    status: "pending_review",
    latestStyleDnaRunId: styleDnaRunId,
    latestAnalysisRunId: analysisRunId,
    topCandidates: candidates,
  });
  return discoveryId;
}

function canonicalizeStyleDnaTraits({
  dbPath,
  atomicTraits,
  taxonomyVersion = DEFAULT_TAXONOMY_VERSION,
  lexicalThreshold = DEFAULT_LEXICAL_THRESHOLD,
  semanticThreshold = DEFAULT_SEMANTIC_THRESHOLD,
  styleDnaRunId = null,
  analysisRunId = null,
}) {
  const canonicalRows = listActiveStyleDnaCanonicalTraits(dbPath, { taxonomyVersion });
  const aliasRows = listActiveStyleDnaTraitAliases(dbPath, { taxonomyVersion });
  const lookups = buildTraitLookups(canonicalRows, aliasRows);
  const canonicalizedTraits = {};
  const unresolvedDiscoveries = [];
  const stats = {
    totalTraits: 0,
    canonicalMatches: 0,
    aliasMatches: 0,
    autoMerged: 0,
    unresolved: 0,
    rejectedAsVague: 0,
  };

  for (const axis of TRAIT_AXES) {
    const input = Array.isArray(atomicTraits?.[axis]) ? atomicTraits[axis] : [];
    const axisCanonical = lookups.canonicalByAxis.get(axis) || [];
    const axisAlias = lookups.aliasByAxis.get(axis) || new Map();
    const resolvedLabels = [];

    for (const rawTrait of input) {
      const originalText = String(rawTrait || "").trim();
      if (originalText === "" || isNoChange(originalText)) {
        continue;
      }
      const normalizedTrait = normalizeTraitText(originalText);
      if (!normalizedTrait) {
        continue;
      }
      stats.totalTraits += 1;

      if (VAGUE_LABEL_DENYLIST.has(normalizedTrait)) {
        stats.rejectedAsVague += 1;
        const discoveryId = addDiscoveryRecord(dbPath, {
          taxonomyVersion,
          axis,
          rawTraitText: originalText,
          normalizedTrait,
          candidates: [],
          styleDnaRunId,
          analysisRunId,
        });
        unresolvedDiscoveries.push({
          discoveryId,
          axis,
          trait: originalText,
          normalizedTrait,
          reason: "vague_label",
        });
        continue;
      }

      const directCanonical = resolveByCanonicalMatch(axisCanonical, normalizedTrait);
      if (directCanonical) {
        resolvedLabels.push(directCanonical.display_label);
        stats.canonicalMatches += 1;
        continue;
      }

      const aliasMatch = axisAlias.get(normalizedTrait) || null;
      if (aliasMatch) {
        const canonical = axisCanonical.find(
          (item) => item.canonical_trait_id === aliasMatch.canonical_trait_id
        );
        if (canonical) {
          resolvedLabels.push(canonical.display_label);
          stats.aliasMatches += 1;
          continue;
        }
      }

      const candidates = topCandidates(axisCanonical, normalizedTrait);
      const top = candidates[0] || null;
      if (shouldAutoMerge(top, lexicalThreshold, semanticThreshold)) {
        const canonical = axisCanonical.find((item) => item.canonical_trait_id === top.canonicalTraitId);
        if (canonical) {
          insertStyleDnaTraitAlias(dbPath, {
            aliasId: `sdt_alias_${crypto.randomUUID()}`,
            taxonomyVersion,
            axis,
            aliasText: originalText,
            normalizedAlias: normalizedTrait,
            canonicalTraitId: canonical.canonical_trait_id,
            source: "discovery_auto_merge",
            mergeMethod: "lexical_semantic_auto",
            lexicalSimilarity: top.lexicalSimilarity,
            semanticSimilarity: top.semanticSimilarity,
            createdBy: "worker:auto",
            reviewNote: "Automatic alias merge from style-dna canonicalizer.",
          });
          resolvedLabels.push(canonical.display_label);
          stats.autoMerged += 1;
          continue;
        }
      }

      const discoveryId = addDiscoveryRecord(dbPath, {
        taxonomyVersion,
        axis,
        rawTraitText: originalText,
        normalizedTrait,
        candidates,
        styleDnaRunId,
        analysisRunId,
      });
      unresolvedDiscoveries.push({
        discoveryId,
        axis,
        trait: originalText,
        normalizedTrait,
        reason: "review_required",
        candidates,
      });
      stats.unresolved += 1;
    }

    canonicalizedTraits[axis] = resolvedLabels.length > 0 ? Array.from(new Set(resolvedLabels)) : ["No change"];
  }

  return {
    taxonomyVersion,
    canonicalizedTraits,
    unresolvedDiscoveries,
    canonicalizationStats: stats,
  };
}

module.exports = {
  DEFAULT_TAXONOMY_VERSION,
  DEFAULT_LEXICAL_THRESHOLD,
  DEFAULT_SEMANTIC_THRESHOLD,
  normalizeTraitText,
  lexicalSimilarity,
  semanticProxySimilarity,
  canonicalizeStyleDnaTraits,
};
