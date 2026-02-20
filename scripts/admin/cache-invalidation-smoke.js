const { spawn } = require("child_process");
const { parseDatabaseUrl, ensureDbParentDir, ensureMigrationsTable, runSql } = require("../db/lib");
const { assertDatabaseReady } = require("../db/runtime");

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

function seedData(dbPath) {
  const now = new Date().toISOString();
  runSql(
    dbPath,
    `
    INSERT INTO users (user_id, role, status, created_at, updated_at)
    VALUES ('admin-cache-smoke-user', 'admin', 'active', ${quote(now)}, ${quote(now)})
    ON CONFLICT(user_id) DO UPDATE SET role = 'admin', status = 'active', updated_at = ${quote(now)};

    INSERT INTO users (user_id, role, status, created_at, updated_at)
    VALUES ('consumer-cache-smoke-user', 'consumer', 'active', ${quote(now)}, ${quote(now)})
    ON CONFLICT(user_id) DO UPDATE SET role = 'consumer', status = 'active', updated_at = ${quote(now)};

    INSERT INTO style_influence_types (
      style_influence_type_id, type_key, label, parameter_prefix, related_parameter_name, description, enabled_flag
    ) VALUES (
      'sit_cache_smoke_profile',
      'profile_cache_smoke',
      'Profile Cache Smoke',
      '--profile',
      '--stylize',
      'Cache invalidation smoke type',
      1
    )
    ON CONFLICT(style_influence_type_id) DO UPDATE SET enabled_flag = 1;

    INSERT INTO style_influences (
      style_influence_id, style_influence_type_id, influence_code, status, pinned_flag, created_by, created_at
    ) VALUES (
      'si_cache_smoke',
      'sit_cache_smoke_profile',
      'p-cache-smoke',
      'active',
      0,
      'admin-cache-smoke-user',
      ${quote(now)}
    )
    ON CONFLICT(style_influence_id) DO UPDATE SET status = 'active', pinned_flag = 0;

    INSERT INTO style_influence_combinations (
      combination_id, name, active_flag, created_at
    ) VALUES (
      'combo_cache_smoke',
      'Cache Smoke Combo',
      1,
      ${quote(now)}
    )
    ON CONFLICT(combination_id) DO UPDATE SET active_flag = 1;

    INSERT OR IGNORE INTO style_influence_combination_items (combination_id, style_influence_id)
    VALUES ('combo_cache_smoke', 'si_cache_smoke');

    INSERT INTO recommendation_extractions (
      extraction_id, status, prompt_text, author, creation_time, source_job_id,
      model_family, model_version, model_selection_source,
      is_baseline, has_profile, has_sref,
      parser_version, metadata_raw_json, created_at, confirmed_at
    ) VALUES (
      'rex_cache_smoke_1',
      'extracted',
      'cache invalidation smoke prompt',
      'smoke-user',
      ${quote(now)},
      'job_cache_smoke_1',
      'standard',
      '6.1',
      'default',
      0,
      1,
      0,
      'v1',
      '[]',
      ${quote(now)},
      NULL
    )
    ON CONFLICT(extraction_id) DO UPDATE SET
      status = 'extracted',
      prompt_text = 'cache invalidation smoke prompt',
      confirmed_at = NULL;

    INSERT INTO recommendation_extractions (
      extraction_id, status, prompt_text, author, creation_time, source_job_id,
      model_family, model_version, model_selection_source,
      is_baseline, has_profile, has_sref,
      parser_version, metadata_raw_json, created_at, confirmed_at
    ) VALUES (
      'rex_cache_smoke_2',
      'extracted',
      'cache invalidation smoke prompt',
      'smoke-user',
      ${quote(now)},
      'job_cache_smoke_2',
      'standard',
      '6.1',
      'default',
      0,
      1,
      0,
      'v1',
      '[]',
      ${quote(now)},
      NULL
    )
    ON CONFLICT(extraction_id) DO UPDATE SET
      status = 'extracted',
      prompt_text = 'cache invalidation smoke prompt',
      confirmed_at = NULL;

    INSERT INTO recommendation_extractions (
      extraction_id, status, prompt_text, author, creation_time, source_job_id,
      model_family, model_version, model_selection_source,
      is_baseline, has_profile, has_sref,
      parser_version, metadata_raw_json, created_at, confirmed_at
    ) VALUES (
      'rex_cache_smoke_3',
      'extracted',
      'cache invalidation smoke prompt',
      'smoke-user',
      ${quote(now)},
      'job_cache_smoke_3',
      'standard',
      '6.1',
      'default',
      0,
      1,
      0,
      'v1',
      '[]',
      ${quote(now)},
      NULL
    )
    ON CONFLICT(extraction_id) DO UPDATE SET
      status = 'extracted',
      prompt_text = 'cache invalidation smoke prompt',
      confirmed_at = NULL;
    `
  );
}

async function postConfirm(baseUrl, token, extractionId) {
  const response = await fetch(`${baseUrl}/recommendation-extractions/${extractionId}/confirm`, {
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
  const json = await response.json();
  if (!response.ok) {
    throw new Error(`Recommendation confirm failed (${response.status}): ${JSON.stringify(json)}`);
  }
  return json;
}

async function getSession(baseUrl, token, sessionId) {
  const response = await fetch(`${baseUrl}/recommendation-sessions/${encodeURIComponent(sessionId)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(`Recommendation session fetch failed (${response.status}): ${JSON.stringify(json)}`);
  }
  return json;
}

async function main() {
  const databaseUrl = requireEnv("DATABASE_URL");
  requireEnv("COGNITO_ISSUER");
  requireEnv("COGNITO_AUDIENCE");
  const dbPath = parseDatabaseUrl(databaseUrl);
  ensureDbParentDir(dbPath);
  ensureMigrationsTable(dbPath);
  assertDatabaseReady(databaseUrl);
  seedData(dbPath);

  const adminToken = buildToken("admin-cache-smoke-user");
  const consumerToken = buildToken("consumer-cache-smoke-user");
  const smokePort = process.env.SMOKE_API_PORT || "3022";
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

    const firstConfirm = await postConfirm(baseUrl, consumerToken, "rex_cache_smoke_1");
    assertCondition(firstConfirm.session.status === "succeeded", "Expected first confirm to succeed");

    const disableResponse = await fetch(
      `${baseUrl}/admin/style-influences/si_cache_smoke/governance`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "disable",
          reason: "cache invalidation smoke disable",
        }),
      }
    );
    const disableJson = await disableResponse.json();
    if (!disableResponse.ok) {
      throw new Error(`Governance disable failed (${disableResponse.status}): ${JSON.stringify(disableJson)}`);
    }
    assertCondition(disableJson.cache && disableJson.cache.invalidated === true, "Expected cache invalidation on governance update");
    assertCondition(
      Number(disableJson.cache.invalidatedEntries || 0) >= 1,
      "Expected at least one cache entry to be invalidated"
    );

    const secondConfirm = await postConfirm(baseUrl, consumerToken, "rex_cache_smoke_2");
    assertCondition(
      ["succeeded", "failed"].includes(secondConfirm.session.status),
      `Unexpected second session status: ${secondConfirm.session.status}`
    );
    const secondSession = await getSession(baseUrl, consumerToken, secondConfirm.session.sessionId);
    const secondRecommendationIds = (secondSession.recommendations || []).map((item) => item.combinationId);
    assertCondition(
      secondRecommendationIds.every((combinationId) => combinationId !== "combo_cache_smoke"),
      "Expected disabled combo to be excluded after governance invalidation"
    );

    const approvalPolicyResponse = await fetch(`${baseUrl}/admin/approval-policy`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        approvalMode: "auto-approve",
        reason: "cache invalidation smoke policy write",
      }),
    });
    const approvalPolicyJson = await approvalPolicyResponse.json();
    if (!approvalPolicyResponse.ok) {
      throw new Error(`Approval policy update failed (${approvalPolicyResponse.status}): ${JSON.stringify(approvalPolicyJson)}`);
    }
    assertCondition(
      approvalPolicyJson.cache && approvalPolicyJson.cache.invalidated === true,
      "Expected cache invalidation on approval policy update"
    );
    assertCondition(
      Number(approvalPolicyJson.cache.invalidatedEntries || 0) >= 1,
      "Expected approval policy update to invalidate at least one cache entry"
    );

    const thirdConfirm = await postConfirm(baseUrl, consumerToken, "rex_cache_smoke_3");
    assertCondition(
      ["succeeded", "failed"].includes(thirdConfirm.session.status),
      `Unexpected third session status: ${thirdConfirm.session.status}`
    );
    const thirdSession = await getSession(baseUrl, consumerToken, thirdConfirm.session.sessionId);
    const thirdRecommendationIds = (thirdSession.recommendations || []).map((item) => item.combinationId);
    assertCondition(
      thirdRecommendationIds.every((combinationId) => combinationId !== "combo_cache_smoke"),
      "Expected disabled combo to stay excluded across subsequent invalidations"
    );

    const promptId = thirdConfirm.session.promptId;
    assertCondition(typeof promptId === "string" && promptId.trim() !== "", "Expected third confirm session to include promptId");
    const promptCurationResponse = await fetch(`${baseUrl}/admin/prompts/${encodeURIComponent(promptId)}/curation`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        status: "experimental",
        reason: "cache invalidation smoke prompt write",
      }),
    });
    const promptCurationJson = await promptCurationResponse.json();
    if (!promptCurationResponse.ok) {
      throw new Error(`Prompt curation update failed (${promptCurationResponse.status}): ${JSON.stringify(promptCurationJson)}`);
    }
    assertCondition(
      promptCurationJson.cache && promptCurationJson.cache.invalidated === true,
      "Expected cache invalidation on prompt curation update"
    );
    assertCondition(
      Number(promptCurationJson.cache.invalidatedEntries || 0) >= 1,
      "Expected prompt curation update to invalidate at least one cache entry"
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          firstSessionStatus: firstConfirm.session.status,
          secondSessionStatus: secondConfirm.session.status,
          thirdSessionStatus: thirdConfirm.session.status,
          secondSessionRecommendationCount: secondRecommendationIds.length,
          thirdSessionRecommendationCount: thirdRecommendationIds.length,
          cacheInvalidated: disableJson.cache.invalidated,
          governanceInvalidatedEntries: disableJson.cache.invalidatedEntries,
          approvalPolicyInvalidatedEntries: approvalPolicyJson.cache.invalidatedEntries,
          promptCurationInvalidatedEntries: promptCurationJson.cache.invalidatedEntries,
          smokePort,
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
