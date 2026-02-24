const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const {
  ensureDbParentDir,
  ensureMigrationsTable,
  listMigrationFiles,
  applyMigration,
} = require("../db/lib");
const {
  listStyleDnaCanonicalTraits,
  listStyleDnaTraitAliases,
} = require("../db/repository");
const { validateStyleDnaTaxonomySeedPayload } = require("../../packages/shared-contracts/src");
const { applyStyleDnaTaxonomySeed } = require("./taxonomy-seed-service");
const { buildSeedCoverageReport } = require("./taxonomy-seed-coverage-core");
const { buildTaxonomySeedDiffReport } = require("./taxonomy-seed-diff-core");

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createTempDbPath() {
  return path.join(os.tmpdir(), `style-dna-taxonomy-seed-v2-rollout-smoke-${Date.now()}-${crypto.randomUUID()}.sqlite3`);
}

function applyAllMigrations(dbPath) {
  ensureDbParentDir(dbPath);
  ensureMigrationsTable(dbPath);
  const migrationFiles = listMigrationFiles();
  migrationFiles.forEach((name) => applyMigration(dbPath, name));
}

function loadSeedPayload(fileName) {
  const seedPath = path.resolve(process.cwd(), `scripts/style-dna/seeds/${fileName}`);
  const raw = fs.readFileSync(seedPath, "utf8");
  return {
    seedPath,
    payload: validateStyleDnaTaxonomySeedPayload(JSON.parse(raw)),
  };
}

function main() {
  const dbPath = createTempDbPath();
  try {
    applyAllMigrations(dbPath);

    const { seedPath: v2SeedPath, payload: v2Payload } = loadSeedPayload("style-dna-taxonomy-seed-v2.json");
    const v2Coverage = buildSeedCoverageReport(v2Payload, {
      minCanonicalPerAxis: 4,
      minAliasesPerAxis: 16,
    });
    assertCondition(v2Coverage.ok === true, `Expected v2 coverage to pass, got deficits=${v2Coverage.deficits.length}`);

    const first = applyStyleDnaTaxonomySeed(dbPath, "smoke:taxonomy-seed-v2-rollout", v2Payload);
    assertCondition(first.summary.canonicalTraits.created === 20, `Expected v2 first canonical created=20, got ${first.summary.canonicalTraits.created}`);
    assertCondition(first.summary.traitAliases.created === 80, `Expected v2 first alias created=80, got ${first.summary.traitAliases.created}`);
    assertCondition(first.summary.traitAliases.conflicts === 0, `Expected v2 first conflicts=0, got ${first.summary.traitAliases.conflicts}`);

    const second = applyStyleDnaTaxonomySeed(dbPath, "smoke:taxonomy-seed-v2-rollout", v2Payload);
    assertCondition(second.summary.canonicalTraits.created === 0, "Expected v2 second canonical created=0");
    assertCondition(second.summary.canonicalTraits.deduplicated === 20, `Expected v2 second canonical dedupe=20, got ${second.summary.canonicalTraits.deduplicated}`);
    assertCondition(second.summary.traitAliases.created === 0, "Expected v2 second alias created=0");
    assertCondition(second.summary.traitAliases.deduplicated === 80, `Expected v2 second alias dedupe=80, got ${second.summary.traitAliases.deduplicated}`);

    const v2Diff = buildTaxonomySeedDiffReport(dbPath, v2Payload);
    assertCondition(v2Diff.summary.missingCanonicalInDb === 0, `Expected v2 diff missingCanonicalInDb=0, got ${v2Diff.summary.missingCanonicalInDb}`);
    assertCondition(v2Diff.summary.missingAliasInDb === 0, `Expected v2 diff missingAliasInDb=0, got ${v2Diff.summary.missingAliasInDb}`);
    assertCondition(v2Diff.summary.aliasConflicts === 0, `Expected v2 diff aliasConflicts=0, got ${v2Diff.summary.aliasConflicts}`);
    assertCondition(v2Diff.summary.canonicalMissingInBundle === 0, `Expected v2 diff canonicalMissingInBundle=0, got ${v2Diff.summary.canonicalMissingInBundle}`);
    assertCondition(v2Diff.summary.aliasesMissingInBundle === 0, `Expected v2 diff aliasesMissingInBundle=0, got ${v2Diff.summary.aliasesMissingInBundle}`);

    const { payload: v1Payload } = loadSeedPayload("style-dna-taxonomy-seed-v1.json");
    const v1Apply = applyStyleDnaTaxonomySeed(dbPath, "smoke:taxonomy-seed-v2-rollout", v1Payload);
    assertCondition(v1Apply.summary.canonicalTraits.created === 10, `Expected v1 canonical created=10 in coexist pass, got ${v1Apply.summary.canonicalTraits.created}`);
    assertCondition(v1Apply.summary.traitAliases.created === 30, `Expected v1 alias created=30 in coexist pass, got ${v1Apply.summary.traitAliases.created}`);

    const v2Rows = {
      canonical: listStyleDnaCanonicalTraits(dbPath, { taxonomyVersion: "style_dna_v2", limit: 5000 }).length,
      aliases: listStyleDnaTraitAliases(dbPath, { taxonomyVersion: "style_dna_v2", limit: 10000 }).length,
    };
    const v1Rows = {
      canonical: listStyleDnaCanonicalTraits(dbPath, { taxonomyVersion: "style_dna_v1", limit: 5000 }).length,
      aliases: listStyleDnaTraitAliases(dbPath, { taxonomyVersion: "style_dna_v1", limit: 10000 }).length,
    };
    assertCondition(v2Rows.canonical === 20 && v2Rows.aliases === 80, `Unexpected v2 row counts: ${JSON.stringify(v2Rows)}`);
    assertCondition(v1Rows.canonical === 10 && v1Rows.aliases === 30, `Unexpected v1 row counts: ${JSON.stringify(v1Rows)}`);

    console.log(
      JSON.stringify(
        {
          ok: true,
          v2SeedPath,
          coverageThresholds: {
            minCanonicalPerAxis: 4,
            minAliasesPerAxis: 16,
          },
          v2CoverageSummary: {
            deficits: v2Coverage.deficits.length,
          },
          firstSummary: first.summary,
          secondSummary: second.summary,
          v2DiffSummary: v2Diff.summary,
          coexistRows: {
            style_dna_v1: v1Rows,
            style_dna_v2: v2Rows,
          },
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
