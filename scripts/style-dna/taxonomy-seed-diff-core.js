const {
  normalizeTraitText,
} = require("../inference/style-dna-canonicalizer");
const {
  listStyleDnaCanonicalTraits,
  listStyleDnaTraitAliases,
} = require("../db/repository");

function compareByKey(a, b) {
  const ka = String(a || "");
  const kb = String(b || "");
  return ka.localeCompare(kb);
}

function buildCanonicalKey(taxonomyVersion, axis, normalizedLabel) {
  return `${taxonomyVersion}::${axis}::${normalizedLabel}`;
}

function buildAliasKey(taxonomyVersion, axis, normalizedAlias) {
  return `${taxonomyVersion}::${axis}::${normalizedAlias}`;
}

function normalizeSeedPayload(payload) {
  const taxonomyVersion = String(payload?.taxonomyVersion || "style_dna_v1").trim() || "style_dna_v1";
  const entries = Array.isArray(payload?.entries) ? payload.entries : [];
  const canonicalMap = new Map();
  const aliasMap = new Map();

  entries.forEach((entry) => {
    const axis = String(entry?.axis || "").trim();
    const displayLabel = String(entry?.displayLabel || "").trim();
    const normalizedLabel = normalizeTraitText(displayLabel);
    if (!axis || !normalizedLabel) {
      return;
    }
    const canonicalKey = buildCanonicalKey(taxonomyVersion, axis, normalizedLabel);
    if (!canonicalMap.has(canonicalKey)) {
      canonicalMap.set(canonicalKey, {
        taxonomyVersion,
        axis,
        displayLabel,
        normalizedLabel,
        aliases: [],
      });
    }
    const canonical = canonicalMap.get(canonicalKey);
    const aliases = Array.isArray(entry?.aliases) ? entry.aliases : [];
    aliases.forEach((aliasTextRaw) => {
      const aliasText = String(aliasTextRaw || "").trim();
      const normalizedAlias = normalizeTraitText(aliasText);
      if (!normalizedAlias) {
        return;
      }
      const aliasKey = buildAliasKey(taxonomyVersion, axis, normalizedAlias);
      if (!aliasMap.has(aliasKey)) {
        aliasMap.set(aliasKey, {
          taxonomyVersion,
          axis,
          aliasText,
          normalizedAlias,
          canonicalKey,
        });
      }
      canonical.aliases.push(aliasKey);
    });
  });

  return {
    taxonomyVersion,
    canonicalMap,
    aliasMap,
  };
}

function choosePreferredAlias(previous, next) {
  if (!previous) {
    return next;
  }
  if (previous.status !== "active" && next.status === "active") {
    return next;
  }
  if (previous.status === next.status) {
    return compareByKey(previous.alias_id, next.alias_id) <= 0 ? previous : next;
  }
  return previous;
}

function buildDatabaseMaps(dbPath, taxonomyVersion) {
  const canonicalRows = listStyleDnaCanonicalTraits(dbPath, {
    taxonomyVersion,
    limit: 5000,
  });
  const aliasRows = listStyleDnaTraitAliases(dbPath, {
    taxonomyVersion,
    limit: 10000,
  });

  const canonicalByKey = new Map();
  canonicalRows.forEach((row) => {
    const key = buildCanonicalKey(row.taxonomy_version, row.axis, row.normalized_label);
    if (!canonicalByKey.has(key)) {
      canonicalByKey.set(key, row);
    }
  });

  const aliasByKey = new Map();
  aliasRows.forEach((row) => {
    const key = buildAliasKey(row.taxonomy_version, row.axis, row.normalized_alias);
    const preferred = choosePreferredAlias(aliasByKey.get(key), row);
    aliasByKey.set(key, preferred);
  });

  return {
    canonicalRows,
    aliasRows,
    canonicalByKey,
    aliasByKey,
  };
}

function buildTaxonomySeedDiffReport(dbPath, payload) {
  const normalizedSeed = normalizeSeedPayload(payload);
  const { taxonomyVersion, canonicalMap, aliasMap } = normalizedSeed;
  const db = buildDatabaseMaps(dbPath, taxonomyVersion);

  const missingCanonicalInDb = [];
  const canonicalReactivationCandidates = [];
  const canonicalLabelMismatches = [];
  const missingAliasInDb = [];
  const aliasReactivationCandidates = [];
  const aliasConflicts = [];
  const canonicalMissingInBundle = [];
  const aliasesMissingInBundle = [];

  const canonicalKeys = Array.from(canonicalMap.keys()).sort(compareByKey);
  canonicalKeys.forEach((canonicalKey) => {
    const seedCanonical = canonicalMap.get(canonicalKey);
    const dbCanonical = db.canonicalByKey.get(canonicalKey);
    if (!dbCanonical) {
      missingCanonicalInDb.push({
        axis: seedCanonical.axis,
        displayLabel: seedCanonical.displayLabel,
        normalizedLabel: seedCanonical.normalizedLabel,
      });
      return;
    }
    if (String(dbCanonical.status) !== "active") {
      canonicalReactivationCandidates.push({
        canonicalTraitId: dbCanonical.canonical_trait_id,
        axis: dbCanonical.axis,
        displayLabel: dbCanonical.display_label,
        status: dbCanonical.status,
      });
    }
    if (String(seedCanonical.displayLabel) !== String(dbCanonical.display_label)) {
      canonicalLabelMismatches.push({
        canonicalTraitId: dbCanonical.canonical_trait_id,
        axis: dbCanonical.axis,
        normalizedLabel: dbCanonical.normalized_label,
        seedDisplayLabel: seedCanonical.displayLabel,
        dbDisplayLabel: dbCanonical.display_label,
      });
    }
  });

  const aliasKeys = Array.from(aliasMap.keys()).sort(compareByKey);
  aliasKeys.forEach((aliasKey) => {
    const seedAlias = aliasMap.get(aliasKey);
    const expectedCanonical = db.canonicalByKey.get(seedAlias.canonicalKey) || null;
    const dbAlias = db.aliasByKey.get(aliasKey);
    if (!dbAlias) {
      missingAliasInDb.push({
        axis: seedAlias.axis,
        aliasText: seedAlias.aliasText,
        normalizedAlias: seedAlias.normalizedAlias,
      });
      return;
    }
    if (String(dbAlias.status) !== "active") {
      aliasReactivationCandidates.push({
        aliasId: dbAlias.alias_id,
        axis: dbAlias.axis,
        aliasText: dbAlias.alias_text,
        status: dbAlias.status,
      });
    }
    if (expectedCanonical && dbAlias.canonical_trait_id !== expectedCanonical.canonical_trait_id) {
      aliasConflicts.push({
        aliasId: dbAlias.alias_id,
        axis: dbAlias.axis,
        aliasText: dbAlias.alias_text,
        normalizedAlias: dbAlias.normalized_alias,
        expectedCanonicalTraitId: expectedCanonical.canonical_trait_id,
        existingCanonicalTraitId: dbAlias.canonical_trait_id,
      });
    }
  });

  const seedCanonicalKeySet = new Set(canonicalKeys);
  db.canonicalRows.forEach((row) => {
    const key = buildCanonicalKey(row.taxonomy_version, row.axis, row.normalized_label);
    if (!seedCanonicalKeySet.has(key)) {
      canonicalMissingInBundle.push({
        canonicalTraitId: row.canonical_trait_id,
        axis: row.axis,
        displayLabel: row.display_label,
        normalizedLabel: row.normalized_label,
        status: row.status,
      });
    }
  });

  const seedAliasKeySet = new Set(aliasKeys);
  db.aliasRows.forEach((row) => {
    const key = buildAliasKey(row.taxonomy_version, row.axis, row.normalized_alias);
    if (!seedAliasKeySet.has(key)) {
      aliasesMissingInBundle.push({
        aliasId: row.alias_id,
        axis: row.axis,
        aliasText: row.alias_text,
        normalizedAlias: row.normalized_alias,
        canonicalTraitId: row.canonical_trait_id,
        status: row.status,
      });
    }
  });

  const sortByFields = (rows, fields) => rows.sort((a, b) => {
    for (const field of fields) {
      const cmp = compareByKey(a[field], b[field]);
      if (cmp !== 0) {
        return cmp;
      }
    }
    return 0;
  });

  sortByFields(missingCanonicalInDb, ["axis", "normalizedLabel"]);
  sortByFields(canonicalReactivationCandidates, ["axis", "canonicalTraitId"]);
  sortByFields(canonicalLabelMismatches, ["axis", "normalizedLabel"]);
  sortByFields(missingAliasInDb, ["axis", "normalizedAlias"]);
  sortByFields(aliasReactivationCandidates, ["axis", "aliasId"]);
  sortByFields(aliasConflicts, ["axis", "normalizedAlias", "aliasId"]);
  sortByFields(canonicalMissingInBundle, ["axis", "normalizedLabel", "canonicalTraitId"]);
  sortByFields(aliasesMissingInBundle, ["axis", "normalizedAlias", "aliasId"]);

  return {
    taxonomyVersion,
    seedEntryCount: canonicalKeys.length,
    summary: {
      missingCanonicalInDb: missingCanonicalInDb.length,
      canonicalReactivationCandidates: canonicalReactivationCandidates.length,
      canonicalLabelMismatches: canonicalLabelMismatches.length,
      missingAliasInDb: missingAliasInDb.length,
      aliasReactivationCandidates: aliasReactivationCandidates.length,
      aliasConflicts: aliasConflicts.length,
      canonicalMissingInBundle: canonicalMissingInBundle.length,
      aliasesMissingInBundle: aliasesMissingInBundle.length,
    },
    missingCanonicalInDb,
    canonicalReactivationCandidates,
    canonicalLabelMismatches,
    missingAliasInDb,
    aliasReactivationCandidates,
    aliasConflicts,
    canonicalMissingInBundle,
    aliasesMissingInBundle,
  };
}

module.exports = {
  buildTaxonomySeedDiffReport,
};
