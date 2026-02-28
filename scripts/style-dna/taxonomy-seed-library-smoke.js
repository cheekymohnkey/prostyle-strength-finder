const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
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
const {
  loadTaxonomySeedLibrary,
  resolveTaxonomySeedSelection,
} = require("./taxonomy-seed-library");
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

function runApplyTaxonomySeedCli({ dbPath, args }) {
  const result = spawnSync("node", ["scripts/style-dna/apply-taxonomy-seed.js", ...args], {
    encoding: "utf8",
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: `file:${dbPath}`,
    },
  });
  const stdout = String(result.stdout || "").trim();
  let json = null;
  if (stdout !== "") {
    json = JSON.parse(stdout);
  }
  return {
    status: Number(result.status || 0),
    stderr: String(result.stderr || "").trim(),
    json,
  };
}

function main() {
  const dbPath = createTempDbPath();
  try {
    applyAllMigrations(dbPath);
    const library = loadTaxonomySeedLibrary();
    assertCondition(library.entries.length >= 2, `Expected >=2 taxonomy seed bundles, got ${library.entries.length}`);

    const selectedV1 = resolveTaxonomySeedSelection({ taxonomyVersion: "style_dna_v1" }).selected;
    const selectedV2 = resolveTaxonomySeedSelection({ taxonomyVersion: "style_dna_v2" }).selected;
    const seedPath = selectedV1.seedPath;
    const payload = selectedV1.payload;

    const first = applyStyleDnaTaxonomySeed(dbPath, "smoke:taxonomy-seed-library", payload);
    assertCondition(first.summary.canonicalTraits.created > 0, "Expected first run to create canonical traits");
    assertCondition(first.summary.traitAliases.created > 0, "Expected first run to create aliases");
    assertCondition(first.summary.traitAliases.conflicts === 0, "Expected first run to have zero alias conflicts");

    const second = applyStyleDnaTaxonomySeed(dbPath, "smoke:taxonomy-seed-library", payload);
    assertCondition(second.summary.canonicalTraits.created === 0, "Expected second run canonical created=0");
    assertCondition(second.summary.traitAliases.created === 0, "Expected second run alias created=0");
    assertCondition(second.summary.canonicalTraits.deduplicated >= first.summary.entryCount, "Expected canonical dedupe on second run");
    assertCondition(second.summary.traitAliases.deduplicated >= first.summary.traitAliases.created, "Expected alias dedupe on second run");

    const listLibrary = runApplyTaxonomySeedCli({
      dbPath,
      args: ["--list-library"],
    });
    assertCondition(listLibrary.status === 0, `Expected --list-library status=0, got ${listLibrary.status}`);
    assertCondition(listLibrary.json?.ok === true, "Expected --list-library output ok=true");
    assertCondition(
      Array.isArray(listLibrary.json?.bundles)
      && listLibrary.json.bundles.some((entry) => entry.taxonomyVersion === "style_dna_v1")
      && listLibrary.json.bundles.some((entry) => entry.taxonomyVersion === "style_dna_v2"),
      "Expected --list-library output to include style_dna_v1 and style_dna_v2"
    );

    const v2FirstApply = runApplyTaxonomySeedCli({
      dbPath,
      args: ["--taxonomy-version", "style_dna_v2", "--require-coverage", "--min-canonical", "4", "--min-aliases", "16"],
    });
    assertCondition(v2FirstApply.status === 0, `Expected v2 apply status=0, got ${v2FirstApply.status}`);
    assertCondition(v2FirstApply.json?.ok === true, "Expected v2 apply output ok=true");
    assertCondition(v2FirstApply.json?.taxonomyVersion === "style_dna_v2", "Expected v2 apply taxonomyVersion=style_dna_v2");
    assertCondition(v2FirstApply.json?.summary?.canonicalTraits?.created > 0, "Expected v2 apply canonical created>0");
    assertCondition(v2FirstApply.json?.summary?.traitAliases?.created > 0, "Expected v2 apply aliases created>0");

    const v2SecondApply = runApplyTaxonomySeedCli({
      dbPath,
      args: ["--taxonomy-version", "style_dna_v2", "--require-coverage", "--min-canonical", "4", "--min-aliases", "16"],
    });
    assertCondition(v2SecondApply.status === 0, `Expected v2 replay apply status=0, got ${v2SecondApply.status}`);
    assertCondition(v2SecondApply.json?.ok === true, "Expected v2 replay apply output ok=true");
    assertCondition(v2SecondApply.json?.summary?.canonicalTraits?.created === 0, "Expected v2 replay canonical created=0");
    assertCondition(v2SecondApply.json?.summary?.traitAliases?.created === 0, "Expected v2 replay alias created=0");
    assertCondition(v2SecondApply.json?.summary?.canonicalTraits?.deduplicated >= selectedV2.entryCount, "Expected v2 replay canonical deduplicated>=entryCount");

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

    const v2CanonicalRows = listStyleDnaCanonicalTraits(dbPath, {
      taxonomyVersion: "style_dna_v2",
      limit: 2000,
    });
    const v2AliasRows = listStyleDnaTraitAliases(dbPath, {
      taxonomyVersion: "style_dna_v2",
      limit: 4000,
    });
    assertCondition(v2CanonicalRows.length > 0, "Expected v2 canonical rows > 0 after taxonomy-version apply");
    assertCondition(v2AliasRows.length > 0, "Expected v2 alias rows > 0 after taxonomy-version apply");

    console.log(
      JSON.stringify(
        {
          ok: true,
          seedPath,
          selectedV2SeedPath: selectedV2.seedPath,
          firstSummary: first.summary,
          secondSummary: second.summary,
          v2FirstSummary: v2FirstApply.json.summary,
          v2SecondSummary: v2SecondApply.json.summary,
          persisted: {
            canonicalCount: canonicalRows.length,
            aliasCount: aliasRows.length,
            v2CanonicalCount: v2CanonicalRows.length,
            v2AliasCount: v2AliasRows.length,
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
