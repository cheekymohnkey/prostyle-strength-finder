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

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createTempDbPath() {
  return path.join(os.tmpdir(), `style-dna-taxonomy-seed-library-smoke-${Date.now()}-${crypto.randomUUID()}.sqlite3`);
}

function applyAllMigrations(dbPath) {
  ensureDbParentDir(dbPath);
  ensureMigrationsTable(dbPath);
  const migrationFiles = listMigrationFiles();
  migrationFiles.forEach((name) => {
    applyMigration(dbPath, name);
  });
}

function loadSeedPayload() {
  const seedPath = path.resolve(process.cwd(), "scripts/style-dna/seeds/style-dna-taxonomy-seed-v1.json");
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
    const { seedPath, payload } = loadSeedPayload();

    const first = applyStyleDnaTaxonomySeed(dbPath, "smoke:taxonomy-seed-library", payload);
    assertCondition(first.summary.canonicalTraits.created > 0, "Expected first run to create canonical traits");
    assertCondition(first.summary.traitAliases.created > 0, "Expected first run to create aliases");
    assertCondition(first.summary.traitAliases.conflicts === 0, "Expected first run to have zero alias conflicts");

    const second = applyStyleDnaTaxonomySeed(dbPath, "smoke:taxonomy-seed-library", payload);
    assertCondition(second.summary.canonicalTraits.created === 0, "Expected second run canonical created=0");
    assertCondition(second.summary.traitAliases.created === 0, "Expected second run alias created=0");
    assertCondition(second.summary.canonicalTraits.deduplicated >= first.summary.entryCount, "Expected canonical dedupe on second run");
    assertCondition(second.summary.traitAliases.deduplicated >= first.summary.traitAliases.created, "Expected alias dedupe on second run");

    const canonicalRows = listStyleDnaCanonicalTraits(dbPath, {
      taxonomyVersion: payload.taxonomyVersion,
      limit: 2000,
    });
    const aliasRows = listStyleDnaTraitAliases(dbPath, {
      taxonomyVersion: payload.taxonomyVersion,
      limit: 4000,
    });
    const expectedAliasCount = payload.entries.reduce(
      (total, entry) => total + (Array.isArray(entry.aliases) ? entry.aliases.length : 0),
      0
    );
    assertCondition(
      canonicalRows.length >= payload.entries.length,
      `Expected canonical rows >= ${payload.entries.length}, got ${canonicalRows.length}`
    );
    assertCondition(
      aliasRows.length >= expectedAliasCount,
      `Expected alias rows >= ${expectedAliasCount}, got ${aliasRows.length}`
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          seedPath,
          firstSummary: first.summary,
          secondSummary: second.summary,
          persisted: {
            canonicalCount: canonicalRows.length,
            aliasCount: aliasRows.length,
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
