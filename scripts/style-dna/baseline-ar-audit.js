#!/usr/bin/env node

const { ensureReady } = require("../db/repository");
const { runSql } = require("../db/lib");

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const [rawKey, valueInToken] = token.split("=");
    const key = rawKey.replace(/^--/, "");
    if (valueInToken !== undefined) {
      args[key] = valueInToken;
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function queryJson(dbPath, sql) {
  const output = runSql(dbPath, sql, { json: true });
  if (!output) return [];
  return JSON.parse(output);
}

function normalizeAspectRatio(value) {
  return String(value || "").trim().replace(/\s+/g, "");
}

function parseExpectedTiers(value) {
  return String(value || "0,100,1000")
    .split(",")
    .map((item) => Number(String(item).trim()))
    .filter((item) => Number.isFinite(item));
}

function main() {
  const args = parseArgs(process.argv);
  const databaseUrl = String(args.dbUrl || process.env.DATABASE_URL || "").trim();
  if (!databaseUrl) {
    console.error(JSON.stringify({ ok: false, message: "DATABASE_URL is required" }, null, 2));
    process.exitCode = 1;
    return;
  }

  const expectedModelFamily = String(args.modelFamily || process.env.STYLE_DNA_AUDIT_MODEL_FAMILY || "standard").trim();
  const expectedModelVersion = String(args.modelVersion || process.env.STYLE_DNA_AUDIT_MODEL_VERSION || "7").trim();
  const expectedAspectRatio = normalizeAspectRatio(args.expectedAr || process.env.STYLE_DNA_AUDIT_EXPECTED_AR || "16:9");
  const expectedTiers = parseExpectedTiers(args.expectedTiers || process.env.STYLE_DNA_AUDIT_EXPECTED_TIERS || "0,100,1000");
  const failOnMismatch = String(args.failOnMismatch || process.env.STYLE_DNA_AUDIT_FAIL_ON_MISMATCH || "false").toLowerCase() === "true";

  let dbPath;
  try {
    dbPath = ensureReady(databaseUrl);
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          message: "failed to open database",
          databaseUrl,
          error: error.message,
          hint: "this audit currently supports SQLite file DATABASE_URL values",
        },
        null,
        2
      )
    );
    process.exitCode = 1;
    return;
  }

  const rows = queryJson(
    dbPath,
    `SELECT
        mj_model_family AS modelFamily,
        mj_model_version AS modelVersion,
        COALESCE(CAST(json_extract(parameter_envelope_json, '$.stylizeTier') AS INTEGER), -1) AS stylizeTier,
        COALESCE(TRIM(json_extract(parameter_envelope_json, '$.aspectRatio')), '') AS aspectRatio,
        COUNT(*) AS setCount,
        MAX(created_at) AS latestCreatedAt
      FROM baseline_render_sets
      GROUP BY modelFamily, modelVersion, stylizeTier, aspectRatio
      ORDER BY modelFamily, modelVersion, stylizeTier, aspectRatio;`
  );

  const normalizedRows = rows.map((row) => ({
    modelFamily: String(row.modelFamily || ""),
    modelVersion: String(row.modelVersion || ""),
    stylizeTier: Number(row.stylizeTier),
    aspectRatio: normalizeAspectRatio(row.aspectRatio),
    setCount: Number(row.setCount || 0),
    latestCreatedAt: row.latestCreatedAt || null,
  }));

  const scopedRows = normalizedRows.filter(
    (row) => row.modelFamily === expectedModelFamily && row.modelVersion === expectedModelVersion
  );

  const rowsByTier = new Map();
  for (const row of scopedRows) {
    const tier = Number(row.stylizeTier);
    if (!rowsByTier.has(tier)) rowsByTier.set(tier, []);
    rowsByTier.get(tier).push(row);
  }

  const missingExpectedTiers = [];
  const mismatchedExpectedTiers = [];
  const mixedAspectRatiosAtExpectedTiers = [];

  for (const tier of expectedTiers) {
    const tierRows = rowsByTier.get(Number(tier)) || [];
    if (!tierRows.length) {
      missingExpectedTiers.push(tier);
      continue;
    }

    const hasExpectedAr = tierRows.some((row) => row.aspectRatio === expectedAspectRatio);
    if (!hasExpectedAr) {
      mismatchedExpectedTiers.push({
        stylizeTier: tier,
        availableAspectRatios: [...new Set(tierRows.map((row) => row.aspectRatio || "(empty)"))],
      });
    }

    const uniqueAr = [...new Set(tierRows.map((row) => row.aspectRatio || "(empty)"))];
    if (uniqueAr.length > 1) {
      mixedAspectRatiosAtExpectedTiers.push({
        stylizeTier: tier,
        aspectRatios: uniqueAr,
      });
    }
  }

  const ok = missingExpectedTiers.length === 0 && mismatchedExpectedTiers.length === 0;

  const result = {
    ok,
    databaseUrl,
    expected: {
      modelFamily: expectedModelFamily,
      modelVersion: expectedModelVersion,
      aspectRatio: expectedAspectRatio,
      stylizeTiers: expectedTiers,
    },
    checks: {
      missingExpectedTiers,
      mismatchedExpectedTiers,
      mixedAspectRatiosAtExpectedTiers,
    },
    summaryRows: scopedRows,
    notes: [
      "mixedAspectRatiosAtExpectedTiers indicates multiple baseline sets exist for the same model/version/stylize tier with different AR values.",
      "Studio selection prefers expected AR where available but should be cleaned up in data governance for deterministic operator behavior.",
    ],
  };

  console.log(JSON.stringify(result, null, 2));

  if (!ok && failOnMismatch) {
    process.exitCode = 1;
  }
}

main();
