const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const {
  ensureDbParentDir,
  ensureMigrationsTable,
  listMigrationFiles,
  applyMigration,
  runSql,
} = require("../db/lib");
const {
  insertStyleDnaCanonicalTrait,
  listActiveStyleDnaTraitAliases,
} = require("../db/repository");
const {
  canonicalizeStyleDnaTraits,
  normalizeTraitText,
} = require("../inference/style-dna-canonicalizer");

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createTempDbPath() {
  return path.join(os.tmpdir(), `style-dna-canonicalization-smoke-${Date.now()}-${crypto.randomUUID()}.sqlite3`);
}

function applyAllMigrations(dbPath) {
  ensureDbParentDir(dbPath);
  ensureMigrationsTable(dbPath);
  const migrationFiles = listMigrationFiles();
  migrationFiles.forEach((name) => {
    applyMigration(dbPath, name);
  });
}

function seedCanonicalTraits(dbPath) {
  insertStyleDnaCanonicalTrait(dbPath, {
    canonicalTraitId: "canon_lighting_rim",
    taxonomyVersion: "style_dna_v1",
    axis: "lighting_and_contrast",
    displayLabel: "rim lighting in haze",
    normalizedLabel: normalizeTraitText("rim lighting in haze"),
    createdBy: "smoke",
  });
  insertStyleDnaCanonicalTrait(dbPath, {
    canonicalTraitId: "canon_color_cyan_magenta",
    taxonomyVersion: "style_dna_v1",
    axis: "color_palette",
    displayLabel: "cyan magenta grade",
    normalizedLabel: normalizeTraitText("cyan magenta grade"),
    createdBy: "smoke",
  });
}

function countPendingDiscoveries(dbPath) {
  const rows = JSON.parse(
    runSql(
      dbPath,
      "SELECT COUNT(1) AS count FROM style_dna_trait_discoveries WHERE status = 'pending_review';",
      { json: true }
    ) || "[]"
  );
  return Number(rows[0]?.count || 0);
}

async function main() {
  const dbPath = createTempDbPath();
  try {
    applyAllMigrations(dbPath);
    seedCanonicalTraits(dbPath);

    const result = await canonicalizeStyleDnaTraits({
      dbPath,
      taxonomyVersion: "style_dna_v1",
      styleDnaRunId: "sdna_run_smoke",
      analysisRunId: "analysis_run_smoke",
      atomicTraits: {
        composition_and_structure: ["No change"],
        lighting_and_contrast: ["rim lighting haze"],
        color_palette: ["cyan-magenta grade", "good colors"],
        texture_and_medium: ["anodized halation"],
      },
    });

    assertCondition(
      Array.isArray(result.canonicalizedTraits.lighting_and_contrast)
      && result.canonicalizedTraits.lighting_and_contrast.includes("rim lighting in haze"),
      `Expected canonicalized lighting trait, got ${JSON.stringify(result.canonicalizedTraits.lighting_and_contrast)}`
    );

    const aliases = listActiveStyleDnaTraitAliases(dbPath, {
      taxonomyVersion: "style_dna_v1",
      axis: "lighting_and_contrast",
    });
    assertCondition(
      aliases.some((row) => row.normalized_alias === normalizeTraitText("rim lighting haze")),
      "Expected auto-merged alias for rim lighting haze"
    );

    assertCondition(
      result.canonicalizationStats.rejectedAsVague >= 1,
      `Expected vague label rejection count >= 1, got ${result.canonicalizationStats.rejectedAsVague}`
    );

    const pendingDiscoveries = countPendingDiscoveries(dbPath);
    assertCondition(
      pendingDiscoveries >= 1,
      `Expected pending discoveries >= 1, got ${pendingDiscoveries}`
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          canonicalizationStats: result.canonicalizationStats,
          pendingDiscoveries,
        },
        null,
        2
      )
    );
  } finally {
    if (fs.existsSync(dbPath)) {
      fs.rmSync(dbPath, { force: true });
    }
  }
}

main();
