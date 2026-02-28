const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { assertDatabaseReady } = require("../db/runtime");
const { validateStyleDnaTaxonomySeedPayload } = require("../../packages/shared-contracts/src");
const { buildSeedCoverageReport } = require("./taxonomy-seed-coverage-core");
const { buildTaxonomySeedDiffReport } = require("./taxonomy-seed-diff-core");
const { applyStyleDnaTaxonomySeed } = require("./taxonomy-seed-service");

const ARTIFACT_STAGES = ["coverage", "diff_before", "apply", "diff_after", "summary"];
const ROLLOUT_NAMING_CONVENTION_VERSION = "sdna_rollout_artifacts_v1";
const RUN_ID_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,126}[A-Za-z0-9])?$/;

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

function normalizeRunIdSegment(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || "taxonomy";
}

function makeRunId(taxonomyVersion) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
  return `${normalizeRunIdSegment(taxonomyVersion)}__${stamp}`;
}

function assertValidRunId(runId) {
  const value = String(runId || "").trim();
  if (!value) {
    throw new Error("run-id is required");
  }
  if (!RUN_ID_PATTERN.test(value)) {
    throw new Error("run-id must match /^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,126}[A-Za-z0-9])?$/");
  }
  return value;
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

function artifactFileName(runId, stage) {
  return `${runId}__${stage}.json`;
}

function writeArtifact(artifactDir, runId, stage, value) {
  const filePath = path.join(artifactDir, artifactFileName(runId, stage));
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
  const runId = assertValidRunId(String(args.runId || "").trim() || makeRunId(payload.taxonomyVersion));

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
  let diffAfterReportSignature = null;
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
      diffAfterReportSignature = diffAfter.reportSignature;
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
    namingConventionVersion: ROLLOUT_NAMING_CONVENTION_VERSION,
    namingConventionTemplate: `{runId}__{${ARTIFACT_STAGES.join("|")}}.json`,
    namingConvention: `${runId}__{coverage|diff_before|apply|diff_after|summary}.json`,
    artifactStagesInOrder: [...ARTIFACT_STAGES],
    artifactFileNames: ARTIFACT_STAGES.reduce((accumulator, stage) => {
      accumulator[stage] = artifactFileName(runId, stage);
      return accumulator;
    }, {}),
    steps: {
      coverage: {
        ok: coverage.ok,
        artifactFileName: artifactFileName(runId, "coverage"),
        artifactPath: coverageArtifactPath,
      },
      diffBefore: {
        ok: true,
        artifactFileName: artifactFileName(runId, "diff_before"),
        artifactPath: diffBeforeArtifactPath,
      },
      apply: args.apply
        ? {
            ok: !blocked,
            blocked,
            requireCoverage: args.requireCoverage,
            artifactFileName: artifactFileName(runId, "apply"),
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
              artifactFileName: artifactFileName(runId, "diff_after"),
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
      diffAfterSignature: diffAfterReportSignature,
      blocked,
      applyRequested: args.apply,
      requireCoverage: args.requireCoverage,
    },
  };
  summary.rolloutEvidenceSignature = sha256Hex(
    toDeterministicJson({
      taxonomyVersion: summary.taxonomyVersion,
      namingConventionVersion: summary.namingConventionVersion,
      namingConventionTemplate: summary.namingConventionTemplate,
      artifactStagesInOrder: summary.artifactStagesInOrder,
      thresholds: summary.thresholds,
      steps: {
        coverage: {
          ok: summary.steps.coverage.ok,
        },
        diffBefore: {
          ok: summary.steps.diffBefore.ok,
        },
        apply: summary.steps.apply?.skipped
          ? {
              skipped: true,
              reason: summary.steps.apply.reason,
            }
          : {
              ok: summary.steps.apply.ok,
              blocked: summary.steps.apply.blocked,
              requireCoverage: summary.steps.apply.requireCoverage,
            },
        diffAfter: summary.steps.diffAfter?.skipped
          ? {
              skipped: true,
              reason: summary.steps.diffAfter.reason,
            }
          : {
              ok: summary.steps.diffAfter.ok,
            },
      },
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
