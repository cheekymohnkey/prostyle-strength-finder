const { spawnSync } = require("child_process");

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
  const baseSteps = [
    { name: "contracts", cmd: "npm run contracts" },
    { name: "db_reset", cmd: "npm run db:reset" },
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
      "admin_role_management_smoke",
      "cache_invalidation_smoke",
      "backup_restore_smoke",
      "queue_recovery_smoke",
      "frontend_critical_flow_smoke",
      "ops_checks",
    ].includes(step.name))
    : baseSteps;

  const results = [];
  for (const step of steps) {
    const result = runStep(step);
    results.push(result);
    if (!result.ok) {
      break;
    }
  }

  const failed = results.find((step) => step.ok === false);
  console.log(
    JSON.stringify(
      {
        ok: !failed,
        scope,
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
