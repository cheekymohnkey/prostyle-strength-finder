const crypto = require("crypto");
const {
  normalizeTraitText,
} = require("../inference/style-dna-canonicalizer");
const {
  getStyleDnaCanonicalTraitById,
  getStyleDnaCanonicalTraitByNormalized,
  insertStyleDnaCanonicalTrait,
  updateStyleDnaCanonicalTraitStatus,
  getStyleDnaTraitAliasByNormalized,
  insertStyleDnaTraitAlias,
  updateStyleDnaTraitAliasStatus,
} = require("../db/repository");

function canonicalTraitIdFromLabel(axis, label) {
  const normalized = normalizeTraitText(label)
    .replace(/[^a-z0-9 ]+/g, " ")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 48);
  const axisPrefix = String(axis || "")
    .replace(/[^a-z0-9]+/g, "_")
    .slice(0, 20);
  const base = normalized || "trait";
  return `canon_${axisPrefix}_${base}_${crypto.randomUUID().slice(0, 6)}`;
}

function applyStyleDnaTaxonomySeed(dbPath, authenticatedUserId, payload) {
  const taxonomyVersion = payload.taxonomyVersion || "style_dna_v1";
  const reactivateDeprecated = payload.reactivateDeprecated !== false;
  const summary = {
    taxonomyVersion,
    entryCount: Array.isArray(payload.entries) ? payload.entries.length : 0,
    canonicalTraits: {
      created: 0,
      deduplicated: 0,
      reactivated: 0,
    },
    traitAliases: {
      created: 0,
      deduplicated: 0,
      reactivated: 0,
      conflicts: 0,
    },
  };
  const conflicts = [];

  for (const entry of payload.entries || []) {
    const normalizedLabel = normalizeTraitText(entry.displayLabel);
    let canonical = getStyleDnaCanonicalTraitByNormalized(dbPath, {
      taxonomyVersion,
      axis: entry.axis,
      normalizedLabel,
    });
    if (!canonical) {
      const canonicalTraitId = canonicalTraitIdFromLabel(entry.axis, entry.displayLabel);
      insertStyleDnaCanonicalTrait(dbPath, {
        canonicalTraitId,
        taxonomyVersion,
        axis: entry.axis,
        displayLabel: entry.displayLabel,
        normalizedLabel,
        status: "active",
        createdBy: authenticatedUserId,
        notes: entry.notes || "Created from taxonomy seed.",
      });
      canonical = getStyleDnaCanonicalTraitById(dbPath, canonicalTraitId)
        || getStyleDnaCanonicalTraitByNormalized(dbPath, {
          taxonomyVersion,
          axis: entry.axis,
          normalizedLabel,
        });
      summary.canonicalTraits.created += 1;
    } else {
      summary.canonicalTraits.deduplicated += 1;
      if (reactivateDeprecated && canonical.status !== "active") {
        updateStyleDnaCanonicalTraitStatus(dbPath, canonical.canonical_trait_id, {
          status: "active",
          notes: "Reactivated by taxonomy seed.",
          updatedAt: new Date().toISOString(),
        });
        canonical = getStyleDnaCanonicalTraitById(dbPath, canonical.canonical_trait_id) || canonical;
        summary.canonicalTraits.reactivated += 1;
      }
    }

    for (const aliasText of entry.aliases || []) {
      const normalizedAlias = normalizeTraitText(aliasText);
      if (!normalizedAlias) {
        continue;
      }
      const existingAlias = getStyleDnaTraitAliasByNormalized(dbPath, {
        taxonomyVersion,
        axis: entry.axis,
        normalizedAlias,
      });
      if (!existingAlias) {
        insertStyleDnaTraitAlias(dbPath, {
          aliasId: `sdt_alias_${crypto.randomUUID()}`,
          taxonomyVersion,
          axis: entry.axis,
          aliasText,
          normalizedAlias,
          canonicalTraitId: canonical.canonical_trait_id,
          source: "migration",
          mergeMethod: "manual_review",
          status: "active",
          createdBy: authenticatedUserId,
          reviewNote: "Created from taxonomy seed.",
        });
        summary.traitAliases.created += 1;
        continue;
      }
      if (existingAlias.canonical_trait_id !== canonical.canonical_trait_id) {
        summary.traitAliases.conflicts += 1;
        conflicts.push({
          axis: entry.axis,
          aliasText,
          normalizedAlias,
          expectedCanonicalTraitId: canonical.canonical_trait_id,
          existingCanonicalTraitId: existingAlias.canonical_trait_id,
          aliasId: existingAlias.alias_id,
        });
        continue;
      }
      summary.traitAliases.deduplicated += 1;
      if (reactivateDeprecated && existingAlias.status !== "active") {
        updateStyleDnaTraitAliasStatus(dbPath, existingAlias.alias_id, {
          status: "active",
          reviewNote: "Reactivated by taxonomy seed.",
          updatedAt: new Date().toISOString(),
        });
        summary.traitAliases.reactivated += 1;
      }
    }
  }

  return {
    summary,
    conflicts,
  };
}

module.exports = {
  canonicalTraitIdFromLabel,
  applyStyleDnaTaxonomySeed,
};
