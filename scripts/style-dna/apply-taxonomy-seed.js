const fs = require("fs");
const path = require("path");
const { assertDatabaseReady } = require("../db/runtime");
const { validateStyleDnaTaxonomySeedPayload } = require("../../packages/shared-contracts/src");
const { applyStyleDnaTaxonomySeed } = require("./taxonomy-seed-service");
const { buildSeedCoverageReport } = require("./taxonomy-seed-coverage-core");

function resolveArgs(argv) {
  const args = {
    file: "scripts/style-dna/seeds/style-dna-taxonomy-seed-v1.json",
    requireCoverage: false,
    minCanonicalPerAxis: 2,
    minAliasesPerAxis: 3,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const token = String(argv[index] || "").trim();
    if (token === "--file" && index + 1 < argv.length) {
      args.file = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (token === "--require-coverage") {
      args.requireCoverage = true;
      continue;
    }
    if (token === "--min-canonical" && index + 1 < argv.length) {
      args.minCanonicalPerAxis = Number.parseInt(String(argv[index + 1] || "").trim(), 10);
      index += 1;
      continue;
    }
    if (token === "--min-aliases" && index + 1 < argv.length) {
      args.minAliasesPerAxis = Number.parseInt(String(argv[index + 1] || "").trim(), 10);
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
      "  node scripts/style-dna/apply-taxonomy-seed.js [--file <path>] [--require-coverage] [--min-canonical <n>] [--min-aliases <n>]",
      "",
      "Defaults:",
      "  --file scripts/style-dna/seeds/style-dna-taxonomy-seed-v1.json",
      "  --min-canonical 2",
      "  --min-aliases 3",
    ].join("\n")
  );
}

function resolveSeedPath(rawPath) {
  const trimmed = String(rawPath || "").trim();
  if (trimmed === "") {
    throw new Error("Seed file path is required");
  }
  return path.isAbsolute(trimmed)
    ? trimmed
    : path.resolve(process.cwd(), trimmed);
}

function resolveActor() {
  const preferred = String(process.env.LOCAL_AUTH_BYPASS_SUBJECT || "").trim();
  if (preferred !== "") {
    return preferred;
  }
  return "system:taxonomy-seed-cli";
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
  assertPositiveInteger(args.minCanonicalPerAxis, "min-canonical");
  assertPositiveInteger(args.minAliasesPerAxis, "min-aliases");

  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  const seedPath = resolveSeedPath(args.file);
  const seedRaw = fs.readFileSync(seedPath, "utf8");
  const seedJson = JSON.parse(seedRaw);
  const payload = validateStyleDnaTaxonomySeedPayload(seedJson);
  const coverage = buildSeedCoverageReport(payload, {
    minCanonicalPerAxis: args.minCanonicalPerAxis,
    minAliasesPerAxis: args.minAliasesPerAxis,
  });

  if (args.requireCoverage && !coverage.ok) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          blocked: true,
          reason: "coverage_requirements_failed",
          seedPath,
          coverage,
        },
        null,
        2
      )
    );
    process.exitCode = 1;
    return;
  }

  const ready = assertDatabaseReady(databaseUrl);
  const actor = resolveActor();
  const result = applyStyleDnaTaxonomySeed(ready.dbPath, actor, payload);

  console.log(
    JSON.stringify(
      {
        ok: true,
        seedPath,
        actor,
        coverage,
        coverageGateApplied: args.requireCoverage,
        summary: result.summary,
        conflicts: result.conflicts,
      },
      null,
      2
    )
  );
}

main();
