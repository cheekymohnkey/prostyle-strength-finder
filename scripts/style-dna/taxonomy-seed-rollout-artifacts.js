const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { assertDatabaseReady } = require("../db/runtime");
const { validateStyleDnaTaxonomySeedPayload } = require("../../packages/shared-contracts/src");
const { buildSeedCoverageReport } = require("./taxonomy-seed-coverage-core");
const { buildTaxonomySeedDiffReport } = require("./taxonomy-seed-diff-core");
const { applyStyleDnaTaxonomySeed } = require("./taxonomy-seed-service");

function resolveArgs(argv) {
  const args = {
    file: "scripts/style-dna/seeds/style-dna-taxonomy-seed-v2.json",
    artifactDir: "tmp/style-dna-taxonomy-rollouts",
    runId: "",
    minCanonicalPerAxis: 2,
    minAliasesPerAxis: 3,
    apply: false,
    requireCoverage: false,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const token = String(argv[index] || "").trim();
    if (token === "--file" && index + 1 < argv.length) {
      args.file = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (token === "--artifact-dir" && index + 1 < argv.length) {
      args.artifactDir = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (token === "--run-id" && index + 1 < argv.length) {
      args.runId = String(argv[index + 1]).trim();
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
    if (token === "--apply") {
      args.apply = true;
      continue;
    }
    if (token === "--require-coverage") {
      args.requireCoverage = true;
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
      "  node scripts/style-dna/taxonomy-seed-rollout-artifacts.js [--file <path>] [--artifact-dir <dir>] [--run-id <id>] [--min-canonical <n>] [--min-aliases <n>] [--apply] [--require-coverage]",
      "",
      "Defaults:",
      "  --file scripts/style-dna/seeds/style-dna-taxonomy-seed-v2.json",
      "  --artifact-dir tmp/style-dna-taxonomy-rollouts",
      "  --min-canonical 2",
      "  --min-aliases 3",
    ].join("\n")
  );
}

function assertPositiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be an integer >= 1`);
  }
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

function makeRunId(taxonomyVersion) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "_").replace(/\..+$/, "Z");
  return `${String(taxonomyVersion || "taxonomy").replace(/[^a-zA-Z0-9_]+/g, "_")}__${stamp}`;
}

function toDeterministicJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => toDeterministicJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort((left, right) => String(left).localeCompare(String(right)));
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${toDeterministicJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function writeArtifact(artifactDir, runId, stage, value) {
  const filePath = path.join(artifactDir, `${runId}__${stage}.json`);
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return filePath;
}

function resolveActor() {
  const preferred = String(process.env.LOCAL_AUTH_BYPASS_SUBJECT || "").trim();
  if (preferred !== "") {
    return preferred;
  }
  return "system:taxonomy-seed-rollout-artifacts";
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
  const seedPath = resolvePath(args.file);
  if (!seedPath) {
    throw new Error("Seed file path is required");
  }
  const artifactDir = resolvePath(args.artifactDir);
  if (!artifactDir) {
    throw new Error("Artifact directory path is required");
  }
  const seedRaw = fs.readFileSync(seedPath, "utf8");
  const payload = validateStyleDnaTaxonomySeedPayload(JSON.parse(seedRaw));
  const runId = String(args.runId || "").trim() || makeRunId(payload.taxonomyVersion);

  fs.mkdirSync(artifactDir, { recursive: true });
  const ready = assertDatabaseReady(databaseUrl);
  const actor = resolveActor();

  const coverage = buildSeedCoverageReport(payload, {
    minCanonicalPerAxis: args.minCanonicalPerAxis,
    minAliasesPerAxis: args.minAliasesPerAxis,
  });
  const coverageArtifactPath = writeArtifact(artifactDir, runId, "coverage", {
    ok: coverage.ok,
    seedPath,
    report: coverage,
  });

  const diffBefore = buildTaxonomySeedDiffReport(ready.dbPath, payload);
  const diffBeforeArtifactPath = writeArtifact(artifactDir, runId, "diff_before", {
    ok: true,
    seedPath,
    report: diffBefore,
  });

  let applyArtifactPath = null;
  let diffAfterArtifactPath = null;
  let applyResult = null;
  let blocked = false;
  if (args.apply) {
    if (args.requireCoverage && !coverage.ok) {
      blocked = true;
      applyResult = {
        ok: false,
        blocked: true,
        reason: "coverage_requirements_failed",
        coverage,
      };
    } else {
      const applied = applyStyleDnaTaxonomySeed(ready.dbPath, actor, payload);
      applyResult = {
        ok: true,
        blocked: false,
        actor,
        summary: applied.summary,
        conflicts: applied.conflicts,
      };
    }
    applyArtifactPath = writeArtifact(artifactDir, runId, "apply", applyResult);
    if (!blocked) {
      const diffAfter = buildTaxonomySeedDiffReport(ready.dbPath, payload);
      diffAfterArtifactPath = writeArtifact(artifactDir, runId, "diff_after", {
        ok: true,
        seedPath,
        report: diffAfter,
      });
    }
  }

  const summary = {
    ok: !(args.requireCoverage && !coverage.ok),
    runId,
    taxonomyVersion: payload.taxonomyVersion,
    seedPath,
    artifactDir,
    namingConvention: `${runId}__{coverage|diff_before|apply|diff_after|summary}.json`,
    steps: {
      coverage: {
        ok: coverage.ok,
        artifactPath: coverageArtifactPath,
      },
      diffBefore: {
        ok: true,
        artifactPath: diffBeforeArtifactPath,
      },
      apply: args.apply
        ? {
            ok: !blocked,
            blocked,
            requireCoverage: args.requireCoverage,
            artifactPath: applyArtifactPath,
          }
        : {
            skipped: true,
            reason: "apply flag not provided",
          },
      diffAfter: args.apply
        ? (!blocked
          ? {
              ok: true,
              artifactPath: diffAfterArtifactPath,
            }
          : {
              skipped: true,
              reason: "apply blocked",
            })
        : {
            skipped: true,
            reason: "apply flag not provided",
          },
    },
    thresholds: {
      minCanonicalPerAxis: args.minCanonicalPerAxis,
      minAliasesPerAxis: args.minAliasesPerAxis,
    },
    preview: {
      coverageReportSignature: coverage.reportSignature,
      diffBeforeSignature: diffBefore.reportSignature,
      diffAfterSignature: diffAfterArtifactPath
        ? JSON.parse(fs.readFileSync(diffAfterArtifactPath, "utf8")).report.reportSignature
        : null,
      blocked,
      applyRequested: args.apply,
      requireCoverage: args.requireCoverage,
    },
  };
  summary.rolloutEvidenceSignature = sha256Hex(
    toDeterministicJson({
      runId: summary.runId,
      taxonomyVersion: summary.taxonomyVersion,
      thresholds: summary.thresholds,
      steps: summary.steps,
      preview: summary.preview,
    })
  );
  const summaryArtifactPath = writeArtifact(artifactDir, runId, "summary", summary);
  process.stdout.write(
    `${JSON.stringify(
      {
        ...summary,
        summaryArtifactPath,
      },
      null,
      2
    )}\n`
  );
  if (!summary.ok) {
    process.exitCode = 1;
  }
}

main();
