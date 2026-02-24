const fs = require("fs");
const path = require("path");
const { assertDatabaseReady } = require("../db/runtime");
const { validateStyleDnaTaxonomySeedPayload } = require("../../packages/shared-contracts/src");
const { buildTaxonomySeedDiffReport } = require("./taxonomy-seed-diff-core");

function resolveArgs(argv) {
  const args = {
    file: "scripts/style-dna/seeds/style-dna-taxonomy-seed-v1.json",
    output: "",
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
      "  node scripts/style-dna/taxonomy-seed-diff.js [--file <path>] [--output <path>]",
      "",
      "Defaults:",
      "  --file scripts/style-dna/seeds/style-dna-taxonomy-seed-v1.json",
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

function main() {
  const args = resolveArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const seedPath = resolvePath(args.file);
  if (!seedPath) {
    throw new Error("Seed file path is required");
  }
  const seedRaw = fs.readFileSync(seedPath, "utf8");
  const payload = validateStyleDnaTaxonomySeedPayload(JSON.parse(seedRaw));

  const ready = assertDatabaseReady(databaseUrl);
  const report = buildTaxonomySeedDiffReport(ready.dbPath, payload);
  const output = {
    ok: true,
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
}

main();
