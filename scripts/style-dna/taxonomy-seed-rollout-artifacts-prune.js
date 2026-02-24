const fs = require("fs");
const {
  STAGES,
  resolvePath,
  collectRuns,
  groupRunsByTaxonomy,
} = require("./taxonomy-seed-rollout-artifacts-lib");

function resolveArgs(argv) {
  const args = {
    artifactDir: "tmp/style-dna-taxonomy-rollouts",
    keep: 5,
    taxonomyVersion: "",
    apply: false,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const token = String(argv[index] || "").trim();
    if (token === "--artifact-dir" && index + 1 < argv.length) {
      args.artifactDir = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (token === "--keep" && index + 1 < argv.length) {
      args.keep = Number.parseInt(String(argv[index + 1] || "").trim(), 10);
      index += 1;
      continue;
    }
    if (token === "--taxonomy-version" && index + 1 < argv.length) {
      args.taxonomyVersion = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (token === "--apply") {
      args.apply = true;
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
      "  node scripts/style-dna/taxonomy-seed-rollout-artifacts-prune.js [--artifact-dir <dir>] [--keep <n>] [--taxonomy-version <value>] [--apply]",
      "",
      "Defaults:",
      "  --artifact-dir tmp/style-dna-taxonomy-rollouts",
      "  --keep 5",
      "",
      "Safety:",
      "  Dry-run by default; pass --apply to delete files.",
    ].join("\n")
  );
}

function assertNonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be an integer >= 0`);
  }
}

function stageFilePaths(run) {
  const files = [];
  STAGES.forEach((stage) => {
    if (run.stagePaths?.[stage]) {
      files.push(run.stagePaths[stage]);
    }
  });
  return files;
}

function main() {
  const args = resolveArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }
  assertNonNegativeInteger(args.keep, "keep");
  const artifactDir = resolvePath(args.artifactDir);
  if (!artifactDir) {
    throw new Error("Artifact directory path is required");
  }
  const taxonomyFilter = String(args.taxonomyVersion || "").trim();

  const allRuns = collectRuns(artifactDir);
  const eligible = taxonomyFilter
    ? allRuns.filter((run) => String(run.taxonomyVersion) === taxonomyFilter)
    : allRuns;
  const grouped = groupRunsByTaxonomy(eligible);

  const keepSet = new Set();
  const pruneRuns = [];
  for (const list of grouped.values()) {
    list.forEach((run, index) => {
      if (index < args.keep) {
        keepSet.add(run.runId);
      } else {
        pruneRuns.push(run);
      }
    });
  }
  pruneRuns.sort((a, b) => a.runId.localeCompare(b.runId));

  const plannedFiles = pruneRuns.flatMap((run) => stageFilePaths(run)).sort((a, b) => a.localeCompare(b));
  const deletedFiles = [];
  if (args.apply) {
    plannedFiles.forEach((filePath) => {
      if (fs.existsSync(filePath)) {
        fs.rmSync(filePath, { force: true });
        deletedFiles.push(filePath);
      }
    });
  }

  const output = {
    ok: true,
    artifactDir,
    taxonomyFilter: taxonomyFilter || null,
    keepPerTaxonomy: args.keep,
    dryRun: !args.apply,
    consideredRuns: eligible.length,
    keptRuns: Array.from(keepSet.values()).sort((a, b) => a.localeCompare(b)),
    prunedRuns: pruneRuns.map((run) => ({
      runId: run.runId,
      taxonomyVersion: run.taxonomyVersion,
      createdAt: run.createdAt,
    })),
    plannedFileDeletes: plannedFiles.length,
    deletedFileCount: deletedFiles.length,
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main();
