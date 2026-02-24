const { spawn } = require("child_process");
const { parseDatabaseUrl, ensureDbParentDir, ensureMigrationsTable, runSql } = require("../db/lib");
const { assertDatabaseReady } = require("../db/runtime");
const { canonicalizeStyleDnaTraits } = require("../inference/style-dna-canonicalizer");

function requireEnv(key) {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value.trim();
}

function quote(value) {
  if (value === null || value === undefined) {
    return "NULL";
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function buildToken(sub) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlJson({ alg: "none", typ: "JWT" });
  const payload = base64UrlJson({
    iss: process.env.COGNITO_ISSUER,
    aud: process.env.COGNITO_AUDIENCE,
    sub,
    exp: now + 3600,
  });
  return `${header}.${payload}.sig`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(baseUrl, token) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        return;
      }
    } catch (_error) {
      // API not ready yet.
    }
    await sleep(200);
  }
  throw new Error("API healthcheck did not become ready in time");
}

function seedUsers(dbPath) {
  const now = new Date().toISOString();
  runSql(
    dbPath,
    `
    INSERT INTO users (user_id, role, status, created_at, updated_at)
    VALUES ('admin-style-dna-taxonomy-seed-smoke-user', 'admin', 'active', ${quote(now)}, ${quote(now)})
    ON CONFLICT(user_id) DO UPDATE SET role = 'admin', status = 'active', updated_at = ${quote(now)};

    INSERT INTO users (user_id, role, status, created_at, updated_at)
    VALUES ('contributor-style-dna-taxonomy-seed-smoke-user', 'contributor', 'active', ${quote(now)}, ${quote(now)})
    ON CONFLICT(user_id) DO UPDATE SET role = 'contributor', status = 'active', updated_at = ${quote(now)};
    `
  );
}

async function main() {
  const databaseUrl = requireEnv("DATABASE_URL");
  requireEnv("COGNITO_ISSUER");
  requireEnv("COGNITO_AUDIENCE");
  const dbPath = parseDatabaseUrl(databaseUrl);
  ensureDbParentDir(dbPath);
  ensureMigrationsTable(dbPath);
  assertDatabaseReady(databaseUrl);
  seedUsers(dbPath);

  const adminToken = buildToken("admin-style-dna-taxonomy-seed-smoke-user");
  const contributorToken = buildToken("contributor-style-dna-taxonomy-seed-smoke-user");
  const smokePort = process.env.SMOKE_API_PORT || "3028";
  const baseUrl = `http://127.0.0.1:${smokePort}/v1`;

  const apiProc = spawn("node", ["apps/api/src/index.js"], {
    env: {
      ...process.env,
      PORT: smokePort,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let apiStderr = "";
  apiProc.stderr.on("data", (chunk) => {
    apiStderr += chunk.toString("utf8");
  });

  try {
    await waitForHealth(baseUrl, adminToken);

    const canonicalDisplayLabel = `smoke seed rim flare ${Date.now()}`;
    const aliasText = `smoke seed rim halo ${Date.now()}`;
    const payload = {
      taxonomyVersion: "style_dna_v1",
      entries: [
        {
          axis: "lighting_and_contrast",
          displayLabel: canonicalDisplayLabel,
          aliases: [aliasText],
          notes: "taxonomy seed smoke entry",
        },
      ],
    };

    const forbiddenSeed = await fetch(`${baseUrl}/admin/style-dna/taxonomy-seed`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${contributorToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    assertCondition(forbiddenSeed.status === 403, `Expected contributor taxonomy seed to return 403, got ${forbiddenSeed.status}`);

    const firstSeedResponse = await fetch(`${baseUrl}/admin/style-dna/taxonomy-seed`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const firstSeedJson = await firstSeedResponse.json();
    if (!firstSeedResponse.ok) {
      throw new Error(`First taxonomy seed failed (${firstSeedResponse.status}): ${JSON.stringify(firstSeedJson)}`);
    }
    assertCondition(firstSeedJson?.summary?.canonicalTraits?.created === 1, "Expected canonical create count=1 in first seed");
    assertCondition(firstSeedJson?.summary?.traitAliases?.created === 1, "Expected alias create count=1 in first seed");

    const secondSeedResponse = await fetch(`${baseUrl}/admin/style-dna/taxonomy-seed`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const secondSeedJson = await secondSeedResponse.json();
    if (!secondSeedResponse.ok) {
      throw new Error(`Second taxonomy seed failed (${secondSeedResponse.status}): ${JSON.stringify(secondSeedJson)}`);
    }
    assertCondition(secondSeedJson?.summary?.canonicalTraits?.created === 0, "Expected canonical create count=0 on idempotent seed");
    assertCondition(secondSeedJson?.summary?.canonicalTraits?.deduplicated >= 1, "Expected canonical deduplicated count >= 1");
    assertCondition(secondSeedJson?.summary?.traitAliases?.created === 0, "Expected alias create count=0 on idempotent seed");
    assertCondition(secondSeedJson?.summary?.traitAliases?.deduplicated >= 1, "Expected alias deduplicated count >= 1");

    const canonicalListResponse = await fetch(
      `${baseUrl}/admin/style-dna/canonical-traits?taxonomyVersion=style_dna_v1&axis=lighting_and_contrast&status=active&limit=200`,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      }
    );
    const canonicalListJson = await canonicalListResponse.json();
    assertCondition(canonicalListResponse.ok, `Expected canonical list success, got ${canonicalListResponse.status}`);
    const canonicalRow = (canonicalListJson?.canonicalTraits || []).find((row) => row.displayLabel === canonicalDisplayLabel);
    assertCondition(Boolean(canonicalRow?.canonicalTraitId), "Expected seeded canonical trait in active list");
    const canonicalTraitId = canonicalRow.canonicalTraitId;

    const aliasListResponse = await fetch(
      `${baseUrl}/admin/style-dna/trait-aliases?taxonomyVersion=style_dna_v1&axis=lighting_and_contrast&status=active&limit=200`,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      }
    );
    const aliasListJson = await aliasListResponse.json();
    assertCondition(aliasListResponse.ok, `Expected alias list success, got ${aliasListResponse.status}`);
    const aliasRow = (aliasListJson?.traitAliases || []).find((row) => row.aliasText === aliasText);
    assertCondition(Boolean(aliasRow?.aliasId), "Expected seeded alias in active list");
    const aliasId = aliasRow.aliasId;

    const aliasDeprecateResponse = await fetch(
      `${baseUrl}/admin/style-dna/trait-aliases/${encodeURIComponent(aliasId)}/status`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          status: "deprecated",
          note: "taxonomy seed smoke deprecate alias",
        }),
      }
    );
    assertCondition(aliasDeprecateResponse.ok, `Expected alias deprecate success, got ${aliasDeprecateResponse.status}`);

    const canonicalDeprecateResponse = await fetch(
      `${baseUrl}/admin/style-dna/canonical-traits/${encodeURIComponent(canonicalTraitId)}/status`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          status: "deprecated",
          note: "taxonomy seed smoke deprecate canonical",
        }),
      }
    );
    assertCondition(canonicalDeprecateResponse.ok, `Expected canonical deprecate success, got ${canonicalDeprecateResponse.status}`);

    const deprecatedReplay = await canonicalizeStyleDnaTraits({
      dbPath,
      taxonomyVersion: "style_dna_v1",
      lexicalThreshold: 1,
      semanticThreshold: 1,
      semantic: { mode: "proxy" },
      styleDnaRunId: `sdna_tax_seed_deprecated_${Date.now()}`,
      analysisRunId: `analysis_tax_seed_deprecated_${Date.now()}`,
      atomicTraits: {
        lighting_and_contrast: [aliasText],
      },
    });
    assertCondition(
      deprecatedReplay.canonicalizationStats.unresolved >= 1,
      `Expected unresolved >= 1 when canonical+alias are deprecated, got ${deprecatedReplay.canonicalizationStats.unresolved}`
    );

    const reactivateSeedResponse = await fetch(`${baseUrl}/admin/style-dna/taxonomy-seed`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const reactivateSeedJson = await reactivateSeedResponse.json();
    if (!reactivateSeedResponse.ok) {
      throw new Error(`Reactivation taxonomy seed failed (${reactivateSeedResponse.status}): ${JSON.stringify(reactivateSeedJson)}`);
    }
    assertCondition(
      reactivateSeedJson?.summary?.canonicalTraits?.reactivated >= 1,
      "Expected canonical reactivated count >= 1"
    );
    assertCondition(
      reactivateSeedJson?.summary?.traitAliases?.reactivated >= 1,
      "Expected alias reactivated count >= 1"
    );

    const reactivatedReplay = await canonicalizeStyleDnaTraits({
      dbPath,
      taxonomyVersion: "style_dna_v1",
      styleDnaRunId: `sdna_tax_seed_reactivated_${Date.now()}`,
      analysisRunId: `analysis_tax_seed_reactivated_${Date.now()}`,
      atomicTraits: {
        lighting_and_contrast: [aliasText],
      },
    });
    assertCondition(
      reactivatedReplay.canonicalizationStats.unresolved === 0,
      `Expected unresolved=0 after reactivation, got ${reactivatedReplay.canonicalizationStats.unresolved}`
    );
    assertCondition(
      reactivatedReplay.canonicalizationStats.aliasMatches >= 1,
      `Expected aliasMatches>=1 after reactivation, got ${reactivatedReplay.canonicalizationStats.aliasMatches}`
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          smokePort,
          taxonomyVersion: "style_dna_v1",
          seeded: {
            canonicalTraitId,
            aliasId,
          },
          firstSeedSummary: firstSeedJson.summary,
          secondSeedSummary: secondSeedJson.summary,
          reactivateSeedSummary: reactivateSeedJson.summary,
          replay: {
            unresolvedWhenDeprecated: deprecatedReplay.canonicalizationStats.unresolved,
            unresolvedAfterReactivation: reactivatedReplay.canonicalizationStats.unresolved,
            aliasMatchesAfterReactivation: reactivatedReplay.canonicalizationStats.aliasMatches,
          },
        },
        null,
        2
      )
    );
  } finally {
    apiProc.kill("SIGTERM");
    await sleep(200);
    if (!apiProc.killed) {
      apiProc.kill("SIGKILL");
    }
    if (apiStderr.trim() !== "") {
      process.stderr.write(apiStderr);
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
