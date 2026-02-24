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
const { validateStyleDnaTaxonomySeedPayload } = require("../../packages/shared-contracts/src");

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createTempDbPath() {
  return path.join(os.tmpdir(), `style-dna-taxonomy-seed-apply-coverage-smoke-${Date.now()}-${crypto.randomUUID()}.sqlite3`);
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

function writeTempSeedFile(payload) {
  const seedPath = path.join(os.tmpdir(), `style-dna-taxonomy-seed-undercovered-${Date.now()}-${crypto.randomUUID()}.json`);
  fs.writeFileSync(seedPath, JSON.stringify(payload, null, 2), "utf8");
  return seedPath;
}

function runApply({ dbPath, seedPath, requireCoverage }) {
  const args = [
    "scripts/style-dna/apply-taxonomy-seed.js",
    "--file",
    seedPath,
    "--min-canonical",
    "2",
    "--min-aliases",
    "3",
  ];
  if (requireCoverage) {
    args.push("--require-coverage");
  }
  const result = spawnSync("node", args, {
    encoding: "utf8",
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: `file:${dbPath}`,
    },
  });
  const stdout = String(result.stdout || "").trim();
  const json = (() => {
    try {
      return stdout ? JSON.parse(stdout) : null;
    } catch (_error) {
      return null;
    }
  })();
  return {
    status: result.status,
    stdout,
    stderr: String(result.stderr || "").trim(),
    json,
  };
}

function main() {
  const dbPath = createTempDbPath();
  let underCoveredSeedPath = "";
  try {
    applyAllMigrations(dbPath);
    const { seedPath, payload } = loadSeedPayload();
    const underCoveredPayload = {
      ...payload,
      entries: payload.entries.filter((entry) => entry.axis !== "dominant_dna_tags"),
    };
    underCoveredSeedPath = writeTempSeedFile(underCoveredPayload);

    const blocked = runApply({
      dbPath,
      seedPath: underCoveredSeedPath,
      requireCoverage: true,
    });
    assertCondition(blocked.status !== 0, "Expected require-coverage apply to fail for under-covered bundle");
    assertCondition(blocked.json?.ok === false, "Expected blocked apply output ok=false");
    assertCondition(blocked.json?.blocked === true, "Expected blocked apply output blocked=true");
    assertCondition(
      String(blocked.json?.reason || "") === "coverage_requirements_failed",
      `Expected blocked reason=coverage_requirements_failed, got ${JSON.stringify(blocked.json)}`
    );
    assertCondition(
      Array.isArray(blocked.json?.coverage?.deficits)
      && blocked.json.coverage.deficits.some((item) => item.axis === "dominant_dna_tags"),
      "Expected blocked apply deficits to include dominant_dna_tags"
    );

    const rowsAfterBlocked = {
      canonical: listStyleDnaCanonicalTraits(dbPath, { taxonomyVersion: "style_dna_v1", limit: 2000 }).length,
      aliases: listStyleDnaTraitAliases(dbPath, { taxonomyVersion: "style_dna_v1", limit: 5000 }).length,
    };
    assertCondition(rowsAfterBlocked.canonical === 0, `Expected canonical rows=0 after blocked apply, got ${rowsAfterBlocked.canonical}`);
    assertCondition(rowsAfterBlocked.aliases === 0, `Expected alias rows=0 after blocked apply, got ${rowsAfterBlocked.aliases}`);

    const ungated = runApply({
      dbPath,
      seedPath: underCoveredSeedPath,
      requireCoverage: false,
    });
    assertCondition(ungated.status === 0, `Expected ungated apply to succeed, got ${ungated.status}`);
    assertCondition(ungated.json?.ok === true, "Expected ungated apply output ok=true");

    const rowsAfterUngated = {
      canonical: listStyleDnaCanonicalTraits(dbPath, { taxonomyVersion: "style_dna_v1", limit: 2000 }).length,
      aliases: listStyleDnaTraitAliases(dbPath, { taxonomyVersion: "style_dna_v1", limit: 5000 }).length,
    };
    assertCondition(rowsAfterUngated.canonical > 0, "Expected canonical rows > 0 after ungated apply");
    assertCondition(rowsAfterUngated.aliases > 0, "Expected alias rows > 0 after ungated apply");

    const gatedGood = runApply({
      dbPath,
      seedPath,
      requireCoverage: true,
    });
    assertCondition(gatedGood.status === 0, `Expected gated apply for full bundle to succeed, got ${gatedGood.status}`);
    assertCondition(gatedGood.json?.ok === true, "Expected gated full apply output ok=true");
    assertCondition(gatedGood.json?.coverageGateApplied === true, "Expected coverageGateApplied=true");

    console.log(
      JSON.stringify(
        {
          ok: true,
          blockedStatus: blocked.status,
          ungatedStatus: ungated.status,
          gatedGoodStatus: gatedGood.status,
          rowsAfterBlocked,
          rowsAfterUngated,
        },
        null,
        2
      )
    );
  } finally {
    if (underCoveredSeedPath && fs.existsSync(underCoveredSeedPath)) {
      fs.rmSync(underCoveredSeedPath, { force: true });
    }
    if (fs.existsSync(dbPath)) {
      fs.rmSync(dbPath, { force: true });
    }
  }
}

main();
