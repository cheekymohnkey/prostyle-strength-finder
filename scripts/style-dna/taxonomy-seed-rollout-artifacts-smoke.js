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
  return path.join(os.tmpdir(), `style-dna-taxonomy-rollout-artifacts-smoke-${Date.now()}-${crypto.randomUUID()}.sqlite3`);
}

function applyAllMigrations(dbPath) {
  ensureDbParentDir(dbPath);
  ensureMigrationsTable(dbPath);
  const migrationFiles = listMigrationFiles();
  migrationFiles.forEach((name) => applyMigration(dbPath, name));
}

function runRolloutScript({ dbPath, seedPath, artifactDir, runId, apply, requireCoverage, minCanonical, minAliases }) {
  const args = [
    "scripts/style-dna/taxonomy-seed-rollout-artifacts.js",
    "--file",
    seedPath,
    "--artifact-dir",
    artifactDir,
    "--run-id",
    runId,
    "--min-canonical",
    String(minCanonical),
    "--min-aliases",
    String(minAliases),
  ];
  if (apply) {
    args.push("--apply");
  }
  if (requireCoverage) {
    args.push("--require-coverage");
  }
  const result = spawnSync("node", args, {
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

function listArtifactNames(artifactDir) {
  return fs.readdirSync(artifactDir).sort();
}

function main() {
  const dbPath = createTempDbPath();
  const artifactDir = path.join(os.tmpdir(), `style-dna-rollout-artifacts-${Date.now()}-${crypto.randomUUID()}`);
  const seedV2 = path.resolve(process.cwd(), "scripts/style-dna/seeds/style-dna-taxonomy-seed-v2.json");
  const seedV1 = path.resolve(process.cwd(), "scripts/style-dna/seeds/style-dna-taxonomy-seed-v1.json");
  fs.mkdirSync(artifactDir, { recursive: true });

  try {
    applyAllMigrations(dbPath);

    const successRunId = "smoke_rollout_success";
    const success = runRolloutScript({
      dbPath,
      seedPath: seedV2,
      artifactDir,
      runId: successRunId,
      apply: true,
      requireCoverage: true,
      minCanonical: 4,
      minAliases: 16,
    });
    assertCondition(success.status === 0, `Expected success rollout status=0, got ${success.status}`);
    assertCondition(success.json?.ok === true, "Expected success rollout json ok=true");
    assertCondition(
      typeof success.json?.rolloutEvidenceSignature === "string" && success.json.rolloutEvidenceSignature.length === 64,
      "Expected success rolloutEvidenceSignature sha256"
    );
    assertCondition(
      success.json?.preview?.coverageReportSignature
      && success.json?.preview?.diffBeforeSignature,
      "Expected success preview signatures"
    );
    assertCondition(
      success.json?.preview?.blocked === false,
      "Expected success preview blocked=false"
    );
    const successNames = listArtifactNames(artifactDir);
    const expectedSuccess = [
      `${successRunId}__apply.json`,
      `${successRunId}__coverage.json`,
      `${successRunId}__diff_after.json`,
      `${successRunId}__diff_before.json`,
      `${successRunId}__summary.json`,
    ];
    expectedSuccess.forEach((name) => {
      assertCondition(successNames.includes(name), `Expected artifact file ${name}`);
    });

    const blockedRunId = "smoke_rollout_blocked";
    const blocked = runRolloutScript({
      dbPath,
      seedPath: seedV1,
      artifactDir,
      runId: blockedRunId,
      apply: true,
      requireCoverage: true,
      minCanonical: 4,
      minAliases: 16,
    });
    assertCondition(blocked.status !== 0, "Expected blocked rollout status != 0");
    assertCondition(blocked.json?.ok === false, "Expected blocked rollout json ok=false");
    assertCondition(
      typeof blocked.json?.rolloutEvidenceSignature === "string" && blocked.json.rolloutEvidenceSignature.length === 64,
      "Expected blocked rolloutEvidenceSignature sha256"
    );
    assertCondition(
      blocked.json?.preview?.blocked === true,
      "Expected blocked preview blocked=true"
    );
    assertCondition(
      blocked.json?.preview?.diffAfterSignature === null,
      "Expected blocked preview diffAfterSignature=null"
    );
    const blockedNames = listArtifactNames(artifactDir);
    const expectedBlocked = [
      `${blockedRunId}__apply.json`,
      `${blockedRunId}__coverage.json`,
      `${blockedRunId}__diff_before.json`,
      `${blockedRunId}__summary.json`,
    ];
    expectedBlocked.forEach((name) => {
      assertCondition(blockedNames.includes(name), `Expected blocked artifact file ${name}`);
    });
    assertCondition(
      !blockedNames.includes(`${blockedRunId}__diff_after.json`),
      "Expected blocked run to skip diff_after artifact"
    );

    const blockedSummary = JSON.parse(
      fs.readFileSync(path.join(artifactDir, `${blockedRunId}__summary.json`), "utf8")
    );
    assertCondition(
      blockedSummary?.steps?.apply?.blocked === true,
      `Expected blocked summary apply.blocked=true, got ${JSON.stringify(blockedSummary?.steps?.apply)}`
    );
    assertCondition(
      blockedSummary?.namingConvention === `${blockedRunId}__{coverage|diff_before|apply|diff_after|summary}.json`,
      "Expected naming convention in summary"
    );
    assertCondition(
      blockedSummary?.rolloutEvidenceSignature === blocked.json?.rolloutEvidenceSignature,
      "Expected blocked summary rolloutEvidenceSignature to match command output"
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          artifactDir,
          successRunId,
          blockedRunId,
          artifactCount: blockedNames.length,
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
