const fs = require("fs");
const path = require("path");
const { validateStyleDnaTaxonomySeedPayload } = require("../../packages/shared-contracts/src");
const { buildSeedCoverageReport } = require("./taxonomy-seed-coverage-core");

function resolveArgs(argv) {
  const args = {
    file: "scripts/style-dna/seeds/style-dna-taxonomy-seed-v1.json",
    output: "",
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
    if (token === "--output" && index + 1 < argv.length) {
      args.output = String(argv[index + 1]).trim();
      index += 1;
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
      "  node scripts/style-dna/taxonomy-seed-coverage.js [--file <path>] [--output <path>] [--min-canonical <n>] [--min-aliases <n>]",
      "",
      "Defaults:",
      "  --file scripts/style-dna/seeds/style-dna-taxonomy-seed-v1.json",
      "  --min-canonical 2",
      "  --min-aliases 3",
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

function main() {
  const args = resolveArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  assertPositiveInteger(args.minCanonicalPerAxis, "min-canonical");
  assertPositiveInteger(args.minAliasesPerAxis, "min-aliases");

  const seedPath = resolvePath(args.file);
  if (!seedPath) {
    throw new Error("Seed file path is required");
  }
  const raw = fs.readFileSync(seedPath, "utf8");
  const payload = validateStyleDnaTaxonomySeedPayload(JSON.parse(raw));

  const report = buildSeedCoverageReport(payload, {
    minCanonicalPerAxis: args.minCanonicalPerAxis,
    minAliasesPerAxis: args.minAliasesPerAxis,
  });
  const output = {
    ok: report.ok,
    seedPath,
    report,
  };
  const rendered = `${JSON.stringify(output, null, 2)}\n`;

  const outputPath = resolvePath(args.output);
  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, rendered, "utf8");
  }

  process.stdout.write(rendered);
  if (!report.ok) {
    process.exitCode = 1;
  }
}

main();
