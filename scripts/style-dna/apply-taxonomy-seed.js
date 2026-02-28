const fs = require("fs");
const path = require("path");
const { assertDatabaseReady } = require("../db/runtime");
const { applyStyleDnaTaxonomySeed } = require("./taxonomy-seed-service");
const { buildSeedCoverageReport } = require("./taxonomy-seed-coverage-core");
const {
  DEFAULT_SEEDS_DIR,
  loadTaxonomySeedLibrary,
  resolveTaxonomySeedSelection,
} = require("./taxonomy-seed-library");

function resolveArgs(argv) {
  const args = {
    file: "",
    taxonomyVersion: "",
    all: false,
    listLibrary: false,
    seedDir: DEFAULT_SEEDS_DIR,
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
    if (token === "--taxonomy-version" && index + 1 < argv.length) {
      args.taxonomyVersion = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (token === "--seed-dir" && index + 1 < argv.length) {
      args.seedDir = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (token === "--all") {
      args.all = true;
      continue;
    }
    if (token === "--list-library") {
      args.listLibrary = true;
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
      "  node scripts/style-dna/apply-taxonomy-seed.js [--file <path> | --taxonomy-version <value> | --all] [--seed-dir <path>] [--list-library] [--require-coverage] [--min-canonical <n>] [--min-aliases <n>]",
      "",
      "Defaults:",
      "  --taxonomy-version style_dna_v1 (from seed library when available)",
      `  --seed-dir ${DEFAULT_SEEDS_DIR}`,
      "  --min-canonical 2",
      "  --min-aliases 3",
    ].join("\n")
  );
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
  if (args.file && args.all) {
    throw new Error("--file and --all cannot be used together");
  }
  if (args.file && args.taxonomyVersion) {
    throw new Error("Use either --file or --taxonomy-version, not both");
  }
  const seedDir = path.isAbsolute(String(args.seedDir || "").trim())
    ? String(args.seedDir || "").trim()
    : path.resolve(process.cwd(), String(args.seedDir || "").trim() || DEFAULT_SEEDS_DIR);

  if (args.listLibrary) {
    const library = loadTaxonomySeedLibrary(seedDir);
    console.log(
      JSON.stringify(
        {
          ok: true,
          seedDir,
          bundles: library.entries.map((entry) => ({
            taxonomyVersion: entry.taxonomyVersion,
            seedPath: entry.seedPath,
            fileName: entry.fileName,
            entryCount: entry.entryCount,
          })),
        },
        null,
        2
      )
    );
    return;
  }

  assertPositiveInteger(args.minCanonicalPerAxis, "min-canonical");
  assertPositiveInteger(args.minAliasesPerAxis, "min-aliases");

  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  const selectedSeeds = args.all
    ? loadTaxonomySeedLibrary(seedDir).entries
    : [
      resolveTaxonomySeedSelection({
        seedDir,
        file: args.file,
        taxonomyVersion: args.taxonomyVersion,
      }).selected,
    ];

  const coverageResults = selectedSeeds.map((entry) => ({
    taxonomyVersion: entry.taxonomyVersion,
    seedPath: entry.seedPath,
    coverage: buildSeedCoverageReport(entry.payload, {
      minCanonicalPerAxis: args.minCanonicalPerAxis,
      minAliasesPerAxis: args.minAliasesPerAxis,
    }),
  }));

  const failedCoverage = coverageResults.filter((item) => !item.coverage.ok);
  if (args.requireCoverage && failedCoverage.length > 0) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          blocked: true,
          reason: "coverage_requirements_failed",
          coverageGateApplied: true,
          coverageGateResult: "blocked",
          mode: args.all ? "library-batch" : "single",
          seedDir,
          seedPath: coverageResults[0]?.seedPath || null,
          coverage: coverageResults[0]?.coverage || null,
          coverageResults,
          failedCoverage,
          failedCoverageCount: failedCoverage.length,
          evaluatedSeedCount: coverageResults.length,
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
  const results = selectedSeeds.map((entry) => {
    const result = applyStyleDnaTaxonomySeed(ready.dbPath, actor, entry.payload);
    return {
      taxonomyVersion: entry.taxonomyVersion,
      seedPath: entry.seedPath,
      summary: result.summary,
      conflicts: result.conflicts,
    };
  });

  const firstResult = results[0];

  console.log(
    JSON.stringify(
      {
        ok: true,
        blocked: false,
        reason: null,
        mode: args.all ? "library-batch" : "single",
        seedDir,
        taxonomyVersion: firstResult.taxonomyVersion,
        seedPath: firstResult.seedPath,
        actor,
        coverage: coverageResults[0].coverage,
        coverageResults,
        coverageGateApplied: args.requireCoverage,
        coverageGateResult: args.requireCoverage ? "passed" : "not_applied",
        failedCoverageCount: failedCoverage.length,
        evaluatedSeedCount: coverageResults.length,
        summary: firstResult.summary,
        conflicts: firstResult.conflicts,
        results,
      },
      null,
      2
    )
  );
}

main();
