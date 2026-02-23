const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { parseDatabaseUrl } = require("../db/lib");

function makeSnapshotTimestamp() {
  const iso = new Date().toISOString();
  return iso.replace(/[-:]/g, "").replace("T", "-").replace(/\..+$/, "Z");
}

function createDbSnapshotIfConfigured() {
  const preserveDb = String(process.env.LAUNCH_SMOKE_PRESERVE_DB || "1").trim() !== "0";
  if (!preserveDb) {
    return null;
  }

  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  if (!databaseUrl) {
    return null;
  }

  const dbPath = parseDatabaseUrl(databaseUrl);
  const existedBefore = fs.existsSync(dbPath);
  if (!existedBefore) {
    return { dbPath, snapshotPath: null, existedBefore, restored: false };
  }

  const checkpointsDir = path.join(path.dirname(dbPath), "checkpoints");
  fs.mkdirSync(checkpointsDir, { recursive: true });
  const dbExt = path.extname(dbPath) || ".sqlite3";
  const dbBase = path.basename(dbPath, dbExt);
  const snapshotPath = path.join(
    checkpointsDir,
    `${dbBase}.pre-launch-smoke.${makeSnapshotTimestamp()}${dbExt}`
  );
  fs.copyFileSync(dbPath, snapshotPath);
  return { dbPath, snapshotPath, existedBefore, restored: false };
}

function restoreDbSnapshot(snapshot) {
  if (!snapshot) {
    return null;
  }
  if (snapshot.existedBefore) {
    if (snapshot.snapshotPath && fs.existsSync(snapshot.snapshotPath)) {
      fs.copyFileSync(snapshot.snapshotPath, snapshot.dbPath);
      return { ...snapshot, restored: true };
    }
    return { ...snapshot, restored: false };
  }

  // If DB did not exist before this smoke run, remove any DB created by the run.
  if (fs.existsSync(snapshot.dbPath)) {
    fs.rmSync(snapshot.dbPath, { force: true });
  }
  return { ...snapshot, restored: true };
}

function runStep(step) {
  const startedAt = Date.now();
  const result = spawnSync("/bin/zsh", ["-lc", step.cmd], {
    encoding: "utf8",
    env: process.env,
  });
  const durationMs = Date.now() - startedAt;
  return {
    name: step.name,
    cmd: step.cmd,
    ok: result.status === 0,
    durationMs,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
  };
}

function main() {
  const scope = (process.env.LAUNCH_SMOKE_SCOPE || "full").trim();
  const snapshot = createDbSnapshotIfConfigured();
  const baseSteps = [
    { name: "contracts", cmd: "npm run contracts" },
    { name: "db_reset", cmd: "npm run db:reset" },
    { name: "style_dna_tier_validation_smoke", cmd: "npm run style-dna:tier-validation-smoke" },
    { name: "style_dna_baseline_smoke", cmd: "npm run style-dna:baseline-smoke" },
    { name: "style_dna_prompt_generation_smoke", cmd: "npm run style-dna:prompt-generation-smoke" },
    { name: "style_dna_run_smoke", cmd: "npm run style-dna:run-smoke" },
    { name: "style_dna_schema_failure_smoke", cmd: "npm run style-dna:schema-failure-smoke" },
    { name: "admin_governance_smoke", cmd: "npm run admin:governance-smoke" },
    { name: "admin_moderation_smoke", cmd: "npm run admin:moderation-smoke" },
    { name: "admin_prompt_curation_smoke", cmd: "npm run admin:prompt-curation-smoke" },
    { name: "admin_approval_policy_smoke", cmd: "npm run admin:approval-policy-smoke" },
    { name: "contributor_essentials_smoke", cmd: "npm run contributor:essentials-smoke" },
    { name: "admin_frontend_proxy_smoke", cmd: "npm run admin:frontend-proxy-smoke" },
    { name: "feedback_service_smoke", cmd: "npm run feedback:service-smoke" },
    { name: "feedback_frontend_proxy_smoke", cmd: "npm run feedback:frontend-proxy-smoke" },
    { name: "admin_role_management_smoke", cmd: "npm run admin:role-management-smoke" },
    { name: "cache_invalidation_smoke", cmd: "npm run cache:invalidation-smoke" },
    { name: "backup_restore_smoke", cmd: "npm run backup:restore-smoke" },
    { name: "queue_recovery_smoke", cmd: "npm run queue:recovery-smoke" },
    { name: "frontend_critical_flow_smoke", cmd: "npm run frontend:critical-flow-smoke" },
    { name: "ops_checks", cmd: "npm run ops:checks" },
  ];

  const steps = scope === "quick"
    ? baseSteps.filter((step) => [
      "contracts",
      "db_reset",
      "style_dna_tier_validation_smoke",
      "admin_role_management_smoke",
      "cache_invalidation_smoke",
      "backup_restore_smoke",
      "queue_recovery_smoke",
      "frontend_critical_flow_smoke",
      "ops_checks",
    ].includes(step.name))
    : baseSteps;

  const results = [];
  let restoredSnapshot = null;
  try {
    for (const step of steps) {
      const result = runStep(step);
      results.push(result);
      if (!result.ok) {
        break;
      }
    }
  } finally {
    restoredSnapshot = restoreDbSnapshot(snapshot);
  }

  const failed = results.find((step) => step.ok === false);
  console.log(
    JSON.stringify(
      {
        ok: !failed,
        scope,
        dbRestore: restoredSnapshot
          ? {
              enabled: true,
              existedBefore: restoredSnapshot.existedBefore,
              restored: restoredSnapshot.restored,
              snapshotPath: restoredSnapshot.snapshotPath,
            }
          : { enabled: false },
        failedStep: failed ? failed.name : null,
        steps: results.map((step) => ({
          name: step.name,
          ok: step.ok,
          durationMs: step.durationMs,
        })),
      },
      null,
      2
    )
  );

  if (failed) {
    if (failed.stdout) {
      process.stderr.write(`${failed.stdout}\n`);
    }
    if (failed.stderr) {
      process.stderr.write(`${failed.stderr}\n`);
    }
    process.exitCode = 1;
  }
}

main();
