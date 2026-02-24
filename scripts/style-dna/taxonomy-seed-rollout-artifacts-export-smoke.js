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
  return path.join(os.tmpdir(), `style-dna-taxonomy-rollout-export-smoke-${Date.now()}-${crypto.randomUUID()}.sqlite3`);
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
  const artifactDir = path.join(os.tmpdir(), `style-dna-rollout-export-src-${Date.now()}-${crypto.randomUUID()}`);
  const destinationDir = path.join(os.tmpdir(), `style-dna-rollout-export-dst-${Date.now()}-${crypto.randomUUID()}`);
  const seedV2 = path.resolve(process.cwd(), "scripts/style-dna/seeds/style-dna-taxonomy-seed-v2.json");
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.mkdirSync(destinationDir, { recursive: true });

  try {
    applyAllMigrations(dbPath);

    const rolloutScript = "scripts/style-dna/taxonomy-seed-rollout-artifacts.js";
    const exportScript = "scripts/style-dna/taxonomy-seed-rollout-artifacts-export.js";
    const runId = "smoke_export_run";

    const rollout = runNodeScript({
      dbPath,
      scriptPath: rolloutScript,
      args: [
        "--file",
        seedV2,
        "--artifact-dir",
        artifactDir,
        "--run-id",
        runId,
        "--min-canonical",
        "4",
        "--min-aliases",
        "16",
        "--apply",
        "--require-coverage",
      ],
    });
    assertCondition(rollout.status === 0, `Expected rollout status=0, got ${rollout.status}`);

    const byRunId = runNodeScript({
      dbPath,
      scriptPath: exportScript,
      args: [
        "--artifact-dir",
        artifactDir,
        "--destination-dir",
        destinationDir,
        "--run-id",
        runId,
      ],
    });
    assertCondition(byRunId.status === 0, `Expected export-by-run-id status=0, got ${byRunId.status}`);
    assertCondition(byRunId.json?.ok === true, "Expected export-by-run-id ok=true");
    assertCondition(
      Array.isArray(byRunId.json?.files) && byRunId.json.files.length >= 5,
      "Expected export-by-run-id files list length >= 5"
    );
    const manifestPath = String(byRunId.json?.manifestPath || "");
    assertCondition(manifestPath !== "" && fs.existsSync(manifestPath), "Expected manifest path to exist");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    assertCondition(manifest.runId === runId, `Expected manifest runId=${runId}`);
    assertCondition(manifest.taxonomyVersion === "style_dna_v2", "Expected manifest taxonomyVersion style_dna_v2");

    const byLatest = runNodeScript({
      dbPath,
      scriptPath: exportScript,
      args: [
        "--artifact-dir",
        artifactDir,
        "--destination-dir",
        destinationDir,
        "--latest",
        "--taxonomy-version",
        "style_dna_v2",
      ],
    });
    assertCondition(byLatest.status === 0, `Expected export-by-latest status=0, got ${byLatest.status}`);
    assertCondition(byLatest.json?.runId === runId, "Expected latest export to target smoke run id");

    const missing = runNodeScript({
      dbPath,
      scriptPath: exportScript,
      args: [
        "--artifact-dir",
        artifactDir,
        "--destination-dir",
        destinationDir,
        "--run-id",
        "missing_run_id",
      ],
    });
    assertCondition(missing.status !== 0, "Expected missing-run export to fail");
    assertCondition(missing.json?.ok === false, "Expected missing-run export ok=false");
    assertCondition(
      String(missing.json?.reason || "") === "run_not_found",
      `Expected missing-run reason=run_not_found, got ${JSON.stringify(missing.json)}`
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          artifactDir,
          destinationDir,
          runId,
          exportedFiles: byRunId.json.files.length,
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
    if (fs.existsSync(destinationDir)) {
      fs.rmSync(destinationDir, { recursive: true, force: true });
    }
  }
}

main();
