const fs = require("fs");
const path = require("path");
const {
  STAGES,
  resolvePath,
  collectRuns,
} = require("./taxonomy-seed-rollout-artifacts-lib");

function resolveArgs(argv) {
  const args = {
    artifactDir: "tmp/style-dna-taxonomy-rollouts",
    destinationDir: "",
    runId: "",
    taxonomyVersion: "",
    latest: false,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const token = String(argv[index] || "").trim();
    if (token === "--artifact-dir" && index + 1 < argv.length) {
      args.artifactDir = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (token === "--destination-dir" && index + 1 < argv.length) {
      args.destinationDir = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (token === "--run-id" && index + 1 < argv.length) {
      args.runId = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (token === "--taxonomy-version" && index + 1 < argv.length) {
      args.taxonomyVersion = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (token === "--latest") {
      args.latest = true;
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
      "  node scripts/style-dna/taxonomy-seed-rollout-artifacts-export.js --destination-dir <dir> [--artifact-dir <dir>] (--run-id <id> | --latest --taxonomy-version <value>)",
      "",
      "Examples:",
      "  node ... --destination-dir /tmp/exports --run-id rollout_20260224_v2",
      "  node ... --destination-dir /tmp/exports --latest --taxonomy-version style_dna_v2",
    ].join("\n")
  );
}

function selectRun(runs, args) {
  const runId = String(args.runId || "").trim();
  if (runId) {
    return runs.find((run) => run.runId === runId) || null;
  }
  if (args.latest) {
    const taxonomyVersion = String(args.taxonomyVersion || "").trim();
    if (!taxonomyVersion) {
      throw new Error("taxonomy-version is required with --latest");
    }
    return runs.find((run) => run.taxonomyVersion === taxonomyVersion) || null;
  }
  throw new Error("Provide either --run-id or --latest --taxonomy-version");
}

function main() {
  const args = resolveArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }
  const artifactDir = resolvePath(args.artifactDir);
  const destinationDir = resolvePath(args.destinationDir);
  if (!artifactDir) {
    throw new Error("artifact-dir is required");
  }
  if (!destinationDir) {
    throw new Error("destination-dir is required");
  }

  const runs = collectRuns(artifactDir);
  const selected = selectRun(runs, args);
  if (!selected) {
    const output = {
      ok: false,
      reason: "run_not_found",
      artifactDir,
      runId: args.runId || null,
      taxonomyVersion: args.taxonomyVersion || null,
    };
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    process.exitCode = 1;
    return;
  }

  fs.mkdirSync(destinationDir, { recursive: true });
  const copied = [];
  STAGES.forEach((stage) => {
    const sourcePath = selected.stagePaths?.[stage];
    if (!sourcePath || !fs.existsSync(sourcePath)) {
      return;
    }
    const fileName = path.basename(sourcePath);
    const destinationPath = path.join(destinationDir, fileName);
    fs.copyFileSync(sourcePath, destinationPath);
    copied.push({
      stage,
      fileName,
      sourcePath,
      destinationPath,
    });
  });

  const manifest = {
    ok: true,
    exportedAt: new Date().toISOString(),
    runId: selected.runId,
    taxonomyVersion: selected.taxonomyVersion,
    artifactDir,
    destinationDir,
    files: copied.sort((a, b) => String(a.fileName).localeCompare(String(b.fileName))),
  };
  const manifestPath = path.join(destinationDir, `${selected.runId}__export_manifest.json`);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  process.stdout.write(
    `${JSON.stringify(
      {
        ...manifest,
        manifestPath,
      },
      null,
      2
    )}\n`
  );
}

main();
