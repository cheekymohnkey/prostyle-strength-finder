const { spawn } = require("child_process");
const { parseDatabaseUrl, ensureDbParentDir, ensureMigrationsTable, runSql } = require("../db/lib");
const { assertDatabaseReady } = require("../db/runtime");

function quote(value) {
  if (value === null || value === undefined) {
    return "NULL";
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function buildLocalToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlJson({ alg: "none", typ: "JWT" });
  const payload = base64UrlJson({
    iss: process.env.COGNITO_ISSUER,
    aud: process.env.COGNITO_AUDIENCE,
    sub: "smoke-user-1",
    exp: now + 3600,
  });
  return `${header}.${payload}.sig`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requireEnv(key) {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value.trim();
}

function seedSmokeData(dbPath) {
  const now = new Date().toISOString();
  const extractionId = `rex_smoke_${Date.now()}`;

  runSql(
    dbPath,
    `
    INSERT INTO style_influence_types (
      style_influence_type_id, type_key, label, parameter_prefix, related_parameter_name, description, enabled_flag
    ) VALUES (
      'sit_profile_smoke',
      'profile_smoke',
      'Profile (Smoke)',
      '--profile',
      '--stylize',
      'Smoke test profile type',
      1
    )
    ON CONFLICT(style_influence_type_id) DO UPDATE SET
      enabled_flag = 1;

    INSERT INTO style_influence_types (
      style_influence_type_id, type_key, label, parameter_prefix, related_parameter_name, description, enabled_flag
    ) VALUES (
      'sit_sref_smoke',
      'sref_smoke',
      'SREF (Smoke)',
      '--sref',
      '--sw',
      'Smoke test sref type',
      1
    )
    ON CONFLICT(style_influence_type_id) DO UPDATE SET
      enabled_flag = 1;

    INSERT INTO style_influences (
      style_influence_id, style_influence_type_id, influence_code, status, pinned_flag, created_by, created_at
    ) VALUES (
      'si_profile_smoke',
      'sit_profile_smoke',
      'p-9d2f',
      'active',
      0,
      'smoke',
      ${quote(now)}
    )
    ON CONFLICT(style_influence_id) DO UPDATE SET
      status = 'active';

    INSERT INTO style_influences (
      style_influence_id, style_influence_type_id, influence_code, status, pinned_flag, created_by, created_at
    ) VALUES (
      'si_sref_smoke',
      'sit_sref_smoke',
      'sref-7ab1',
      'active',
      0,
      'smoke',
      ${quote(now)}
    )
    ON CONFLICT(style_influence_id) DO UPDATE SET
      status = 'active';

    INSERT INTO style_influence_combinations (
      combination_id, name, active_flag, created_at
    ) VALUES (
      'combo_street_editorial',
      'Street Editorial',
      1,
      ${quote(now)}
    )
    ON CONFLICT(combination_id) DO UPDATE SET
      active_flag = 1;

    INSERT OR IGNORE INTO style_influence_combination_items (
      combination_id, style_influence_id
    ) VALUES ('combo_street_editorial', 'si_profile_smoke');

    INSERT OR IGNORE INTO style_influence_combination_items (
      combination_id, style_influence_id
    ) VALUES ('combo_street_editorial', 'si_sref_smoke');

    INSERT INTO recommendation_extractions (
      extraction_id, status, prompt_text, author, creation_time, source_job_id,
      model_family, model_version, model_selection_source,
      is_baseline, has_profile, has_sref,
      parser_version, metadata_raw_json, created_at, confirmed_at
    ) VALUES (
      ${quote(extractionId)},
      'extracted',
      'cinematic portrait of a boxer in rain --ar 3:4 --v 6',
      'smoke-user',
      ${quote(now)},
      '123e4567-e89b-12d3-a456-426614174000',
      'standard',
      '6',
      'prompt_flag',
      0,
      1,
      1,
      'midjourney-metadata-v1',
      '[]',
      ${quote(now)},
      NULL
    );
    `
  );

  return { extractionId };
}

async function waitForHealth(baseUrl, token) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
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
      // Process may not be listening yet.
    }
    await sleep(250);
  }
  throw new Error("API healthcheck did not become ready in time");
}

async function main() {
  const databaseUrl = requireEnv("DATABASE_URL");
  const dbPath = parseDatabaseUrl(databaseUrl);
  ensureDbParentDir(dbPath);
  ensureMigrationsTable(dbPath);
  assertDatabaseReady(databaseUrl);

  const originalPort = requireEnv("PORT");
  const smokePort = process.env.SMOKE_API_PORT || "3011";
  const token = buildLocalToken();
  const baseUrl = `http://127.0.0.1:${smokePort}/v1`;

  const { extractionId } = seedSmokeData(dbPath);

  const apiProc = spawn("node", ["apps/api/src/index.js"], {
    env: {
      ...process.env,
      PORT: smokePort,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  apiProc.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });

  try {
    await waitForHealth(baseUrl, token);

    const confirmResponse = await fetch(`${baseUrl}/recommendation-extractions/${extractionId}/confirm`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        confirmed: true,
        mode: "precision",
      }),
    });
    const confirmJson = await confirmResponse.json();
    if (!confirmResponse.ok) {
      throw new Error(`Confirm endpoint failed (${confirmResponse.status}): ${JSON.stringify(confirmJson)}`);
    }

    const sessionId = confirmJson?.session?.sessionId;
    if (!sessionId) {
      throw new Error("Confirm response did not include session.sessionId");
    }

    const sessionResponse = await fetch(`${baseUrl}/recommendation-sessions/${sessionId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const sessionJson = await sessionResponse.json();
    if (!sessionResponse.ok) {
      throw new Error(`Session endpoint failed (${sessionResponse.status}): ${JSON.stringify(sessionJson)}`);
    }

    const recommendations = sessionJson?.session?.recommendations;
    if (!Array.isArray(recommendations) || recommendations.length === 0) {
      throw new Error("Smoke check failed: expected non-empty recommendations array");
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          extractionId,
          sessionId,
          sessionStatus: sessionJson.session.status,
          recommendationCount: recommendations.length,
          firstRecommendation: {
            recommendationId: recommendations[0].recommendationId,
            combinationId: recommendations[0].combinationId,
            confidence: recommendations[0].confidence,
          },
          port: smokePort,
          previousPort: originalPort,
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
    if (stderr.trim() !== "") {
      process.stderr.write(stderr);
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
