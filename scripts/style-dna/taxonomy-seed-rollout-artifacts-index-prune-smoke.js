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

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createTempDbPath() {
  return path.join(os.tmpdir(), `style-dna-taxonomy-rollout-index-prune-smoke-${Date.now()}-${crypto.randomUUID()}.sqlite3`);
}

function applyAllMigrations(dbPath) {
  ensureDbParentDir(dbPath);
  ensureMigrationsTable(dbPath);
  const migrationFiles = listMigrationFiles();
  migrationFiles.forEach((name) => applyMigration(dbPath, name));
}

function runNodeScript({ dbPath, scriptPath, args }) {
  const result = spawnSync("node", [scriptPath, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
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
  const artifactDir = path.join(os.tmpdir(), `style-dna-rollout-index-prune-artifacts-${Date.now()}-${crypto.randomUUID()}`);
  const seedV1 = path.resolve(process.cwd(), "scripts/style-dna/seeds/style-dna-taxonomy-seed-v1.json");
  const seedV2 = path.resolve(process.cwd(), "scripts/style-dna/seeds/style-dna-taxonomy-seed-v2.json");
  fs.mkdirSync(artifactDir, { recursive: true });

  try {
    applyAllMigrations(dbPath);

    const rolloutScript = "scripts/style-dna/taxonomy-seed-rollout-artifacts.js";
    const indexScript = "scripts/style-dna/taxonomy-seed-rollout-artifacts-index.js";
    const pruneScript = "scripts/style-dna/taxonomy-seed-rollout-artifacts-prune.js";

    const runIds = [
      { runId: "smoke_v2_a", seed: seedV2 },
      { runId: "smoke_v2_b", seed: seedV2 },
      { runId: "smoke_v2_c", seed: seedV2 },
      { runId: "smoke_v1_a", seed: seedV1 },
      { runId: "smoke_v1_b", seed: seedV1 },
    ];

    runIds.forEach((item) => {
      const rollout = runNodeScript({
        dbPath,
        scriptPath: rolloutScript,
        args: [
          "--file",
          item.seed,
          "--artifact-dir",
          artifactDir,
          "--run-id",
          item.runId,
          "--min-canonical",
          "2",
          "--min-aliases",
          "3",
        ],
      });
      assertCondition(rollout.status === 0, `Expected rollout ${item.runId} to succeed, got ${rollout.status}`);
      assertCondition(rollout.json?.runId === item.runId, `Expected rollout runId ${item.runId}`);
    });

    const indexFirst = runNodeScript({
      dbPath,
      scriptPath: indexScript,
      args: [
        "--artifact-dir",
        artifactDir,
      ],
    });
    const indexSecond = runNodeScript({
      dbPath,
      scriptPath: indexScript,
      args: [
        "--artifact-dir",
        artifactDir,
      ],
    });
    assertCondition(indexFirst.status === 0, "Expected first index status=0");
    assertCondition(indexSecond.status === 0, "Expected second index status=0");
    assertCondition(indexFirst.stdout === indexSecond.stdout, "Expected index output to be deterministic");
    assertCondition(indexFirst.json?.totalRuns === 5, `Expected totalRuns=5, got ${indexFirst.json?.totalRuns}`);
    assertCondition(
      Array.isArray(indexFirst.json?.latestByTaxonomy) && indexFirst.json.latestByTaxonomy.length === 2,
      "Expected latestByTaxonomy entries for v1 and v2"
    );

    const pruneDryRun = runNodeScript({
      dbPath,
      scriptPath: pruneScript,
      args: [
        "--artifact-dir",
        artifactDir,
        "--keep",
        "1",
      ],
    });
    assertCondition(pruneDryRun.status === 0, "Expected prune dry-run status=0");
    assertCondition(pruneDryRun.json?.dryRun === true, "Expected prune dry-run mode");
    assertCondition(pruneDryRun.json?.plannedFileDeletes === 9, `Expected plannedFileDeletes=9, got ${pruneDryRun.json?.plannedFileDeletes}`);

    const pruneApply = runNodeScript({
      dbPath,
      scriptPath: pruneScript,
      args: [
        "--artifact-dir",
        artifactDir,
        "--keep",
        "1",
        "--apply",
      ],
    });
    assertCondition(pruneApply.status === 0, "Expected prune apply status=0");
    assertCondition(pruneApply.json?.dryRun === false, "Expected prune apply mode");
    assertCondition(pruneApply.json?.deletedFileCount === 9, `Expected deletedFileCount=9, got ${pruneApply.json?.deletedFileCount}`);

    const indexAfterPrune = runNodeScript({
      dbPath,
      scriptPath: indexScript,
      args: [
        "--artifact-dir",
        artifactDir,
      ],
    });
    assertCondition(indexAfterPrune.status === 0, "Expected post-prune index status=0");
    assertCondition(indexAfterPrune.json?.totalRuns === 2, `Expected totalRuns=2 after prune, got ${indexAfterPrune.json?.totalRuns}`);
    const namesAfter = fs.readdirSync(artifactDir);
    assertCondition(namesAfter.length === 6, `Expected 6 artifact files after prune, got ${namesAfter.length}`);

    console.log(
      JSON.stringify(
        {
          ok: true,
          artifactDir,
          totalRunsBefore: indexFirst.json.totalRuns,
          totalRunsAfter: indexAfterPrune.json.totalRuns,
          filesAfterPrune: namesAfter.length,
        },
        null,
        2
      )
    );
  } finally {
    if (fs.existsSync(dbPath)) {
      fs.rmSync(dbPath, { force: true });
    }
    if (fs.existsSync(artifactDir)) {
      fs.rmSync(artifactDir, { recursive: true, force: true });
    }
  }
}

main();
