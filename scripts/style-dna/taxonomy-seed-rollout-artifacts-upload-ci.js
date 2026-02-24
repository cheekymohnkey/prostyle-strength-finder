const { spawnSync } = require("child_process");
const path = require("path");

function resolveArgs(argv) {
  const args = {
    storagePolicyMode: "",
    help: false,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const token = String(argv[index] || "").trim();
    if (token === "--storage-policy-mode" && index + 1 < argv.length) {
      args.storagePolicyMode = String(argv[index + 1] || "").trim().toLowerCase();
      index += 1;
      continue;
    }
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function printHelp() {
  console.log(
    [
      "Usage:",
      "  node scripts/style-dna/taxonomy-seed-rollout-artifacts-upload-ci.js [--storage-policy-mode isolated|shared]",
      "",
      "Behavior:",
      "  Runs rollout upload smoke with CI-focused env-contract validation.",
      "  isolated (default): uses local fixture storage path for adapter validation.",
      "  shared: requires APP_ENV/S3_BUCKET/AWS_REGION and runs storage-adapter path against current env.",
    ].join("\n")
  );
}

function requiredEnv(key) {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value.trim();
}

function resolveStoragePolicyMode(args) {
  const cliValue = String(args.storagePolicyMode || "").trim().toLowerCase();
  const envValue = String(process.env.STYLE_DNA_ROLLOUT_UPLOAD_CI_STORAGE_POLICY_MODE || "").trim().toLowerCase();
  const mode = cliValue || envValue || "isolated";
  if (mode !== "isolated" && mode !== "shared") {
    throw new Error(
      `Invalid storage policy mode: ${mode}. Expected one of: isolated, shared`
    );
  }
  return mode;
}

function runSmoke(mode) {
  if (mode === "shared") {
    requiredEnv("APP_ENV");
    requiredEnv("S3_BUCKET");
    requiredEnv("AWS_REGION");
  }

  const smokeScript = path.resolve(
    process.cwd(),
    "scripts/style-dna/taxonomy-seed-rollout-artifacts-upload-smoke.js"
  );
  const result = spawnSync(
    "node",
    [smokeScript, "--storage-policy-mode", mode],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: process.env,
    }
  );
  const stdout = String(result.stdout || "").trim();
  const stderr = String(result.stderr || "").trim();
  const json = (() => {
    try {
      return stdout ? JSON.parse(stdout) : null;
    } catch (_error) {
      return null;
    }
  })();
  if (result.status !== 0) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: false,
          reason: "upload_smoke_failed",
          storagePolicyMode: mode,
          status: result.status,
          smokeOutput: json || stdout || null,
          smokeStderr: stderr || null,
        },
        null,
        2
      )}\n`
    );
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        storagePolicyMode: mode,
        smoke: json || null,
      },
      null,
      2
    )}\n`
  );
}

function main() {
  try {
    const args = resolveArgs(process.argv);
    if (args.help) {
      printHelp();
      return;
    }
    const mode = resolveStoragePolicyMode(args);
    runSmoke(mode);
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: false,
          reason: "invalid_env_contract",
          message: error.message,
        },
        null,
        2
      )}\n`
    );
    process.exitCode = 1;
  }
}

main();
