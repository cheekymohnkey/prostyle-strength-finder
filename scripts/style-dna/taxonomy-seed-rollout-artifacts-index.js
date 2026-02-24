const fs = require("fs");
const path = require("path");
const {
  resolvePath,
  collectRuns,
  groupRunsByTaxonomy,
} = require("./taxonomy-seed-rollout-artifacts-lib");

function resolveArgs(argv) {
  const args = {
    artifactDir: "tmp/style-dna-taxonomy-rollouts",
    taxonomyVersion: "",
    limit: 50,
    output: "",
  };
  for (let index = 2; index < argv.length; index += 1) {
    const token = String(argv[index] || "").trim();
    if (token === "--artifact-dir" && index + 1 < argv.length) {
      args.artifactDir = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (token === "--taxonomy-version" && index + 1 < argv.length) {
      args.taxonomyVersion = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (token === "--limit" && index + 1 < argv.length) {
      args.limit = Number.parseInt(String(argv[index + 1] || "").trim(), 10);
      index += 1;
      continue;
    }
    if (token === "--output" && index + 1 < argv.length) {
      args.output = String(argv[index + 1]).trim();
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
      "  node scripts/style-dna/taxonomy-seed-rollout-artifacts-index.js [--artifact-dir <dir>] [--taxonomy-version <value>] [--limit <n>] [--output <path>]",
      "",
      "Defaults:",
      "  --artifact-dir tmp/style-dna-taxonomy-rollouts",
      "  --limit 50",
    ].join("\n")
  );
}

function assertPositiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be an integer >= 1`);
  }
}

function main() {
  const args = resolveArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }
  assertPositiveInteger(args.limit, "limit");

  const artifactDir = resolvePath(args.artifactDir);
  if (!artifactDir) {
    throw new Error("Artifact directory path is required");
  }

  const taxonomyFilter = String(args.taxonomyVersion || "").trim();
  let runs = collectRuns(artifactDir);
  if (taxonomyFilter) {
    runs = runs.filter((run) => String(run.taxonomyVersion) === taxonomyFilter);
  }
  const limited = runs.slice(0, args.limit);
  const groups = groupRunsByTaxonomy(limited);

  const output = {
    ok: true,
    artifactDir,
    taxonomyFilter: taxonomyFilter || null,
    totalRuns: runs.length,
    returnedRuns: limited.length,
    runs: limited.map((run) => ({
      runId: run.runId,
      taxonomyVersion: run.taxonomyVersion,
      createdAt: run.createdAt,
      summaryPath: run.summaryPath,
      stageAvailability: run.stageAvailability,
    })),
    latestByTaxonomy: Array.from(groups.entries())
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
      .map(([taxonomyVersion, list]) => ({
        taxonomyVersion,
        runCount: list.length,
        latestRunId: list[0]?.runId || null,
        latestSummaryPath: list[0]?.summaryPath || null,
        latestCreatedAt: list[0]?.createdAt || null,
      })),
  };

  const rendered = `${JSON.stringify(output, null, 2)}\n`;
  const outputPath = resolvePath(args.output);
  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, rendered, "utf8");
  }
  process.stdout.write(rendered);
}

main();
