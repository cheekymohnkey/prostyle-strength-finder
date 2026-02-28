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
  getStyleDnaCanonicalTraitByNormalized,
  getStyleDnaTraitAliasByNormalized,
  updateStyleDnaCanonicalTraitStatus,
  updateStyleDnaTraitAliasStatus,
  insertStyleDnaTraitAlias,
} = require("../db/repository");
const { validateStyleDnaTaxonomySeedPayload } = require("../../packages/shared-contracts/src");
const { applyStyleDnaTaxonomySeed } = require("./taxonomy-seed-service");
const { buildTaxonomySeedDiffReport } = require("./taxonomy-seed-diff-core");
const { normalizeTraitText } = require("../inference/style-dna-canonicalizer");

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createTempDbPath() {
  return path.join(os.tmpdir(), `style-dna-taxonomy-seed-diff-smoke-${Date.now()}-${crypto.randomUUID()}.sqlite3`);
}

function applyAllMigrations(dbPath) {
  ensureDbParentDir(dbPath);
  ensureMigrationsTable(dbPath);
  const migrationFiles = listMigrationFiles();
  migrationFiles.forEach((name) => applyMigration(dbPath, name));
}

function loadSeedPayload() {
  const seedPath = path.resolve(process.cwd(), "scripts/style-dna/seeds/style-dna-taxonomy-seed-v1.json");
  const raw = fs.readFileSync(seedPath, "utf8");
  return {
    seedPath,
    payload: validateStyleDnaTaxonomySeedPayload(JSON.parse(raw)),
  };
}

function quote(value) {
  if (value === null || value === undefined) {
    return "NULL";
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

function main() {
  const dbPath = createTempDbPath();
  const outputPath = path.join(os.tmpdir(), `style-dna-taxonomy-seed-diff-smoke-report-${Date.now()}-${crypto.randomUUID()}.json`);
  try {
    applyAllMigrations(dbPath);
    const { seedPath, payload } = loadSeedPayload();
    applyStyleDnaTaxonomySeed(dbPath, "smoke:taxonomy-seed-diff", payload);

    const firstEntry = payload.entries[0];
    const firstAxis = firstEntry.axis;
    const firstCanonicalNormalized = normalizeTraitText(firstEntry.displayLabel);
    const firstCanonical = getStyleDnaCanonicalTraitByNormalized(dbPath, {
      taxonomyVersion: payload.taxonomyVersion,
      axis: firstAxis,
      normalizedLabel: firstCanonicalNormalized,
    });
    assertCondition(Boolean(firstCanonical?.canonical_trait_id), "Expected first canonical trait to exist");
    updateStyleDnaCanonicalTraitStatus(dbPath, firstCanonical.canonical_trait_id, {
      status: "deprecated",
      notes: "diff smoke deprecate canonical",
      updatedAt: new Date().toISOString(),
    });

    const firstAliasText = firstEntry.aliases[0];
    const firstAliasNormalized = normalizeTraitText(firstAliasText);
    const firstAlias = getStyleDnaTraitAliasByNormalized(dbPath, {
      taxonomyVersion: payload.taxonomyVersion,
      axis: firstAxis,
      normalizedAlias: firstAliasNormalized,
    });
    assertCondition(Boolean(firstAlias?.alias_id), "Expected first alias to exist");
    updateStyleDnaTraitAliasStatus(dbPath, firstAlias.alias_id, {
      status: "deprecated",
      reviewNote: "diff smoke deprecate alias",
      updatedAt: new Date().toISOString(),
    });

    const secondEntry = payload.entries[1];
    const secondCanonical = getStyleDnaCanonicalTraitByNormalized(dbPath, {
      taxonomyVersion: payload.taxonomyVersion,
      axis: secondEntry.axis,
      normalizedLabel: normalizeTraitText(secondEntry.displayLabel),
    });
    assertCondition(Boolean(secondCanonical?.canonical_trait_id), "Expected second canonical trait to exist");
    const conflictAliasText = secondEntry.aliases[0];
    const conflictAliasNormalized = normalizeTraitText(conflictAliasText);
    const conflictAlias = getStyleDnaTraitAliasByNormalized(dbPath, {
      taxonomyVersion: payload.taxonomyVersion,
      axis: secondEntry.axis,
      normalizedAlias: conflictAliasNormalized,
    });
    assertCondition(Boolean(conflictAlias?.alias_id), "Expected conflict alias to exist");
    runSql(
      dbPath,
      `UPDATE style_dna_trait_aliases
       SET canonical_trait_id = ${quote(firstCanonical.canonical_trait_id)}
       WHERE alias_id = ${quote(conflictAlias.alias_id)};`
    );

    insertStyleDnaCanonicalTrait(dbPath, {
      canonicalTraitId: `canon_extra_${crypto.randomUUID().slice(0, 8)}`,
      taxonomyVersion: payload.taxonomyVersion,
      axis: "lighting_and_contrast",
      displayLabel: `extra canonical ${Date.now()}`,
      normalizedLabel: normalizeTraitText(`extra canonical ${Date.now()}`),
      status: "active",
      createdBy: "smoke",
    });

    insertStyleDnaTraitAlias(dbPath, {
      aliasId: `sdt_alias_${crypto.randomUUID()}`,
      taxonomyVersion: payload.taxonomyVersion,
      axis: "lighting_and_contrast",
      aliasText: `extra alias ${Date.now()}`,
      normalizedAlias: normalizeTraitText(`extra alias ${Date.now()}`),
      canonicalTraitId: firstCanonical.canonical_trait_id,
      source: "manual_review",
      mergeMethod: "manual_review",
      status: "active",
      createdBy: "smoke",
    });

    const firstReport = buildTaxonomySeedDiffReport(dbPath, payload);
    const secondReport = buildTaxonomySeedDiffReport(dbPath, payload);
    assertCondition(
      JSON.stringify(firstReport) === JSON.stringify(secondReport),
      "Expected taxonomy diff report to be deterministic across repeated runs"
    );
    assertCondition(
      typeof firstReport.reportSignature === "string" && firstReport.reportSignature.length === 64,
      "Expected deterministic reportSignature sha256"
    );
    assertCondition(
      firstReport.reportSignature === secondReport.reportSignature,
      "Expected reportSignature to remain stable across repeated runs"
    );
    assertCondition(
      Array.isArray(firstReport.summaryByAxis) && firstReport.summaryByAxis.length >= 1,
      "Expected summaryByAxis rollups in diff report"
    );
    assertCondition(
      firstReport.summaryByAxis.some((row) => Number(row.aliasConflicts || 0) >= 1),
      "Expected summaryByAxis to include alias conflict axis counts"
    );
    assertCondition(firstReport.summary.canonicalReactivationCandidates >= 1, "Expected canonical reactivation candidate");
    assertCondition(firstReport.summary.aliasReactivationCandidates >= 1, "Expected alias reactivation candidate");
    assertCondition(firstReport.summary.aliasConflicts >= 1, "Expected alias conflict candidate");
    assertCondition(firstReport.summary.canonicalMissingInBundle >= 1, "Expected canonical missing-in-bundle rows");
    assertCondition(firstReport.summary.aliasesMissingInBundle >= 1, "Expected alias missing-in-bundle rows");

    fs.writeFileSync(
      outputPath,
      JSON.stringify(
        {
          ok: true,
          seedPath,
          preview: {
            taxonomyVersion: firstReport.taxonomyVersion,
            seedEntryCount: firstReport.seedEntryCount,
            reportSignature: firstReport.reportSignature,
            summaryByAxisCount: firstReport.summaryByAxis.length,
          },
          report: firstReport,
        },
        null,
        2
      ),
      "utf8"
    );
    const rendered = fs.readFileSync(outputPath, "utf8");
    const parsed = JSON.parse(rendered);
    assertCondition(parsed?.ok === true, "Expected output report file with ok=true");
    assertCondition(parsed?.report?.summary?.aliasConflicts >= 1, "Expected output report alias conflicts");
    assertCondition(
      parsed?.preview?.reportSignature === firstReport.reportSignature,
      "Expected output preview reportSignature to match generated report"
    );
    assertCondition(
      parsed?.preview?.summaryByAxisCount === firstReport.summaryByAxis.length,
      "Expected output preview summaryByAxisCount to match rollups"
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          seedPath,
          outputPath,
          summary: firstReport.summary,
        },
        null,
        2
      )
    );
  } finally {
    if (fs.existsSync(dbPath)) {
      fs.rmSync(dbPath, { force: true });
    }
    if (fs.existsSync(outputPath)) {
      fs.rmSync(outputPath, { force: true });
    }
  }
}

main();
