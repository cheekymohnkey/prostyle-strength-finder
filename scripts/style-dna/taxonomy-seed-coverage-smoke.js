const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { validateStyleDnaTaxonomySeedPayload } = require("../../packages/shared-contracts/src");
const { buildSeedCoverageReport } = require("./taxonomy-seed-coverage-core");

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function loadSeedPayload() {
  const seedPath = path.resolve(process.cwd(), "scripts/style-dna/seeds/style-dna-taxonomy-seed-v1.json");
  const raw = fs.readFileSync(seedPath, "utf8");
  return {
    seedPath,
    payload: validateStyleDnaTaxonomySeedPayload(JSON.parse(raw)),
  };
}

function runCoverage(payload, thresholds) {
  return buildSeedCoverageReport(payload, thresholds);
}

function main() {
  const { seedPath, payload } = loadSeedPayload();
  const passReport = runCoverage(payload, {
    minCanonicalPerAxis: 2,
    minAliasesPerAxis: 3,
  });
  assertCondition(passReport.ok === true, "Expected default seed bundle coverage check to pass");
  assertCondition(passReport.deficits.length === 0, "Expected zero deficits for default seed bundle");

  const underCoveredPayload = {
    ...payload,
    entries: payload.entries.filter((entry) => entry.axis !== "dominant_dna_tags"),
  };
  const failReport = runCoverage(underCoveredPayload, {
    minCanonicalPerAxis: 2,
    minAliasesPerAxis: 3,
  });
  assertCondition(failReport.ok === false, "Expected under-covered fixture to fail coverage check");
  const dominantDeficit = failReport.deficits.find((item) => item.axis === "dominant_dna_tags");
  assertCondition(Boolean(dominantDeficit), "Expected dominant_dna_tags deficit row");
  assertCondition(
    dominantDeficit.canonicalDeficit === 2 && dominantDeficit.aliasDeficit === 3,
    `Expected dominant_dna_tags deficits canonical=2 alias=3, got ${JSON.stringify(dominantDeficit)}`
  );

  const outputPath = path.join(os.tmpdir(), `style-dna-taxonomy-seed-coverage-smoke-${Date.now()}-${crypto.randomUUID()}.json`);
  try {
    fs.writeFileSync(
      outputPath,
      JSON.stringify(
        {
          ok: failReport.ok,
          report: failReport,
        },
        null,
        2
      ),
      "utf8"
    );
    const persisted = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    assertCondition(persisted?.ok === false, "Expected persisted fail report ok=false");
    assertCondition(
      Array.isArray(persisted?.report?.deficits) && persisted.report.deficits.some((item) => item.axis === "dominant_dna_tags"),
      "Expected persisted fail report deficits to include dominant_dna_tags"
    );
  } finally {
    if (fs.existsSync(outputPath)) {
      fs.rmSync(outputPath, { force: true });
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        seedPath,
        passSummary: {
          deficits: passReport.deficits.length,
        },
        failSummary: {
          deficits: failReport.deficits.length,
          dominantDnaTagsDeficit: dominantDeficit,
        },
      },
      null,
      2
    )
  );
}

main();
