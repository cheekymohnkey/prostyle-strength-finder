const fs = require("fs");
const path = require("path");

function resolveArgs(argv) {
  const args = {
    retentionRoot: "tmp/style-dna-evidence/shared-ci",
    appEnv: "",
    maxAgeDays: 7,
    failOnStale: false,
    output: "",
    help: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const token = String(argv[index] || "").trim();
    if (token === "--retention-root" && index + 1 < argv.length) {
      args.retentionRoot = String(argv[index + 1] || "").trim();
      index += 1;
      continue;
    }
    if (token === "--app-env" && index + 1 < argv.length) {
      args.appEnv = String(argv[index + 1] || "").trim();
      index += 1;
      continue;
    }
    if (token === "--max-age-days" && index + 1 < argv.length) {
      args.maxAgeDays = Number.parseInt(String(argv[index + 1] || "").trim(), 10);
      index += 1;
      continue;
    }
    if (token === "--fail-on-stale") {
      args.failOnStale = true;
      continue;
    }
    if (token === "--output" && index + 1 < argv.length) {
      args.output = String(argv[index + 1] || "").trim();
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
      "  node scripts/style-dna/taxonomy-seed-evidence-governance-check.js [--retention-root <dir>] [--app-env <name>] [--max-age-days <n>] [--fail-on-stale] [--output <path>]",
      "",
      "Behavior:",
      "  Scans shared-mode retention evidence directories and emits deterministic freshness status.",
      "  Evidence is fresh only when latest retention run includes both export manifest and upload receipt",
      "  and captured timestamp age is <= max-age-days.",
      "",
      "Defaults:",
      "  --retention-root tmp/style-dna-evidence/shared-ci",
      "  --max-age-days 7",
    ].join("\n")
  );
}

function resolvePath(rawPath) {
  const trimmed = String(rawPath || "").trim();
  if (trimmed === "") {
    return "";
  }
  return path.isAbsolute(trimmed)
    ? trimmed
    : path.resolve(process.cwd(), trimmed);
}

function assertPositiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be an integer >= 1`);
  }
}

function readDirectoryEntriesSafe(dirPath) {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true });
  } catch (_error) {
    return [];
  }
}

function parseCapturedAtFromTimestampDir(dirName) {
  const raw = String(dirName || "").trim();
  if (!/^\d{8}T\d{6}Z$/.test(raw)) {
    return null;
  }
  const iso = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(9, 11)}:${raw.slice(11, 13)}:${raw.slice(13, 15)}Z`;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) {
    return null;
  }
  return {
    iso,
    ms,
  };
}

function findEvidenceFiles(retentionDirPath) {
  const entries = readDirectoryEntriesSafe(retentionDirPath)
    .filter((entry) => entry.isFile())
    .map((entry) => String(entry.name || "").trim())
    .sort((a, b) => a.localeCompare(b));
  const manifestFile = entries.find((name) => /__export_manifest\.json$/.test(name)) || "";
  const receiptFile = entries.find((name) => /__upload_receipt\.json$/.test(name)) || "";
  return {
    manifestPath: manifestFile ? path.join(retentionDirPath, manifestFile) : null,
    receiptPath: receiptFile ? path.join(retentionDirPath, receiptFile) : null,
  };
}

function collectEnvironmentEvidence(options) {
  const rootPath = resolvePath(options.retentionRoot);
  const envFilter = String(options.appEnv || "").trim();
  const envEntries = readDirectoryEntriesSafe(rootPath)
    .filter((entry) => entry.isDirectory())
    .map((entry) => String(entry.name || "").trim())
    .filter((name) => name !== "")
    .filter((name) => !envFilter || name === envFilter)
    .sort((a, b) => a.localeCompare(b));

  return envEntries.map((appEnv) => {
    const envDir = path.join(rootPath, appEnv);
    const runDirs = readDirectoryEntriesSafe(envDir)
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const runName = String(entry.name || "").trim();
        const parsed = parseCapturedAtFromTimestampDir(runName);
        if (!parsed) {
          return null;
        }
        const retentionDir = path.join(envDir, runName);
        const files = findEvidenceFiles(retentionDir);
        return {
          retentionDir,
          capturedAtUtc: parsed.iso,
          capturedAtMs: parsed.ms,
          manifestPath: files.manifestPath,
          receiptPath: files.receiptPath,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.capturedAtMs - a.capturedAtMs);

    return {
      appEnv,
      runs: runDirs,
    };
  });
}

function deriveEnvironmentStatus(envData, nowMs, maxAgeMs) {
  const latest = envData.runs[0] || null;
  if (!latest) {
    return {
      appEnv: envData.appEnv,
      runCount: 0,
      status: "stale",
      reason: "no_evidence",
      latestEvidence: null,
    };
  }

  const hasManifest = Boolean(latest.manifestPath && fs.existsSync(latest.manifestPath));
  const hasReceipt = Boolean(latest.receiptPath && fs.existsSync(latest.receiptPath));
  const ageMs = Math.max(0, nowMs - latest.capturedAtMs);
  const ageDays = Number((ageMs / (24 * 60 * 60 * 1000)).toFixed(3));
  const withinThreshold = ageMs <= maxAgeMs;

  let status = "fresh";
  let reason = "within_threshold";
  if (!hasManifest || !hasReceipt) {
    status = "stale";
    reason = "missing_required_artifacts";
  } else if (!withinThreshold) {
    status = "stale";
    reason = "older_than_threshold";
  }

  return {
    appEnv: envData.appEnv,
    runCount: envData.runs.length,
    status,
    reason,
    latestEvidence: {
      retentionDir: latest.retentionDir,
      capturedAtUtc: latest.capturedAtUtc,
      ageDays,
      manifestPath: latest.manifestPath,
      receiptPath: latest.receiptPath,
      manifestExists: hasManifest,
      receiptExists: hasReceipt,
    },
  };
}

function buildOutput(args) {
  assertPositiveInteger(args.maxAgeDays, "max-age-days");
  const retentionRoot = resolvePath(args.retentionRoot);
  if (!retentionRoot) {
    throw new Error("retention-root is required");
  }
  const nowMs = Date.now();
  const maxAgeMs = args.maxAgeDays * 24 * 60 * 60 * 1000;
  const envEvidence = collectEnvironmentEvidence({
    retentionRoot,
    appEnv: args.appEnv,
  });
  const environments = envEvidence.map((entry) => deriveEnvironmentStatus(entry, nowMs, maxAgeMs));
  const staleEnvironments = environments
    .filter((entry) => entry.status === "stale")
    .map((entry) => entry.appEnv)
    .sort((a, b) => a.localeCompare(b));

  const latestAcrossAll = environments
    .filter((entry) => entry.latestEvidence)
    .sort((a, b) => Date.parse(b.latestEvidence.capturedAtUtc) - Date.parse(a.latestEvidence.capturedAtUtc))[0] || null;

  const hasAnyEvidence = environments.some((entry) => entry.latestEvidence);
  let status = "fresh";
  let reason = "within_threshold";
  if (!hasAnyEvidence) {
    status = "stale";
    reason = "no_evidence";
  } else if (staleEnvironments.length > 0) {
    status = "stale";
    reason = "stale_environment_detected";
  }

  return {
    ok: true,
    generatedAtUtc: new Date(nowMs).toISOString(),
    retentionRoot,
    appEnvFilter: String(args.appEnv || "").trim() || null,
    maxAgeDays: args.maxAgeDays,
    status,
    reason,
    staleEnvironmentCount: staleEnvironments.length,
    staleEnvironments,
    latestEvidence: latestAcrossAll
      ? {
        appEnv: latestAcrossAll.appEnv,
        ...latestAcrossAll.latestEvidence,
      }
      : null,
    environments: environments.map((entry) => ({
      appEnv: entry.appEnv,
      runCount: entry.runCount,
      status: entry.status,
      reason: entry.reason,
      latestEvidence: entry.latestEvidence,
    })),
  };
}

function writeOutput(rendered, outputPath) {
  const resolvedOutputPath = resolvePath(outputPath);
  if (!resolvedOutputPath) {
    return;
  }
  fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
  fs.writeFileSync(resolvedOutputPath, rendered, "utf8");
}

function main() {
  const args = resolveArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }
  const output = buildOutput(args);
  const rendered = `${JSON.stringify(output, null, 2)}\n`;
  writeOutput(rendered, args.output);
  process.stdout.write(rendered);
  if (args.failOnStale && output.status === "stale") {
    process.exitCode = 1;
  }
}

main();
