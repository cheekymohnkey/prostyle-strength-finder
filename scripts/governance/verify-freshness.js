#!/usr/bin/env node
/**
 * Governance evidence freshness helper.
 * Usage:
 *   node scripts/governance/verify-freshness.js --env prod --status /path/to/latest_governance_status.json
 * Defaults:
 *   --env prod
 *   --status ./tmp/style-dna-evidence/shared-ci/<env>/latest_governance_status.json
 */

const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const [key, value] = argv[i].split("=");
    const normalizedKey = key.replace(/^--/, "");
    if (value !== undefined) {
      args[normalizedKey] = value;
      continue;
    }

    const nextToken = argv[i + 1];
    if (nextToken && !nextToken.startsWith("--")) {
      args[normalizedKey] = nextToken;
      i += 1;
    } else {
      args[normalizedKey] = true;
    }
  }
  return args;
}

function findEnvironmentEntry(statusJson, appEnv) {
  if (statusJson.latestEvidence && statusJson.latestEvidence.appEnv === appEnv) {
    return statusJson.latestEvidence;
  }
  const match = (statusJson.environments || []).find((env) => env.appEnv === appEnv);
  return match ? match.latestEvidence : null;
}

function main() {
  const args = parseArgs(process.argv);
  const appEnv = String(args.env || "prod");
  const requireArtifacts = String(args.requireArtifacts || "false").toLowerCase() === "true";
  const defaultStatusPath = path.join(
    process.cwd(),
    "tmp",
    "style-dna-evidence",
    "shared-ci",
    appEnv,
    "latest_governance_status.json"
  );
  const statusPath = args.status ? path.resolve(String(args.status)) : defaultStatusPath;

  if (!fs.existsSync(statusPath)) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          message: "status file not found",
          statusPath,
          hint: "pass --status /path/to/latest_governance_status.json or ensure the default path exists",
        },
        null,
        2
      )
    );
    process.exitCode = 1;
    return;
  }

  let raw;
  try {
    raw = fs.readFileSync(statusPath, "utf8");
  } catch (error) {
    console.error(
      JSON.stringify(
        { ok: false, message: "failed to read status file", statusPath, error: error.message },
        null,
        2
      )
    );
    process.exitCode = 1;
    return;
  }

  let statusJson;
  try {
    statusJson = JSON.parse(raw);
  } catch (error) {
    console.error(
      JSON.stringify(
        { ok: false, message: "failed to parse status JSON", statusPath, error: error.message },
        null,
        2
      )
    );
    process.exitCode = 1;
    return;
  }

  const latest = findEnvironmentEntry(statusJson, appEnv);
  if (!latest) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          message: "no environment entry found",
          appEnv,
          statusPath,
        },
        null,
        2
      )
    );
    process.exitCode = 1;
    return;
  }

  const isFresh = statusJson.status === "fresh" && statusJson.reason === "within_threshold";
  const artifactsOk = latest.manifestExists === true && latest.receiptExists === true;
  const result = {
    ok: statusJson.ok === true && isFresh && (!requireArtifacts || artifactsOk),
    appEnv,
    generatedAtUtc: statusJson.generatedAtUtc,
    maxAgeDays: statusJson.maxAgeDays,
    status: statusJson.status,
    reason: statusJson.reason,
    staleEnvironmentCount: statusJson.staleEnvironmentCount,
    retentionRoot: statusJson.retentionRoot,
    retentionDir: latest.retentionDir,
    manifestPath: latest.manifestPath,
    receiptPath: latest.receiptPath,
    manifestExists: latest.manifestExists,
    receiptExists: latest.receiptExists,
    capturedAtUtc: latest.capturedAtUtc,
    ageDays: latest.ageDays,
    artifactsOk,
    requireArtifacts,
  };

  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    process.exitCode = 1;
  }
}

main();
