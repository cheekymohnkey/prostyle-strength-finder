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
  const older = new Date(Date.now() - 60_000).toISOString();
  runSql(
    dbPath,
    `
    INSERT INTO users (user_id, role, status, created_at, updated_at)
    VALUES ('admin-curation-smoke-user', 'admin', 'active', ${quote(now)}, ${quote(now)})
    ON CONFLICT(user_id) DO UPDATE SET role = 'admin', status = 'active', updated_at = ${quote(now)};

    INSERT INTO users (user_id, role, status, created_at, updated_at)
    VALUES ('consumer-curation-smoke-user', 'consumer', 'active', ${quote(now)}, ${quote(now)})
    ON CONFLICT(user_id) DO UPDATE SET role = 'consumer', status = 'active', updated_at = ${quote(now)};

    INSERT INTO style_influence_types (
      style_influence_type_id, type_key, label, parameter_prefix, related_parameter_name, description, enabled_flag
    ) VALUES (
      'sit_prompt_curation_smoke',
      'profile_prompt_curation_smoke',
      'Profile Prompt Curation Smoke',
      '--profile',
      '--stylize',
      'Prompt curation smoke type',
      1
    )
    ON CONFLICT(style_influence_type_id) DO UPDATE SET enabled_flag = 1;

    INSERT INTO style_influences (
      style_influence_id, style_influence_type_id, influence_code, status, pinned_flag, created_by, created_at
    ) VALUES (
      'si_prompt_curation_smoke',
      'sit_prompt_curation_smoke',
      'p-curation-smoke',
      'active',
      0,
      'admin-curation-smoke-user',
      ${quote(now)}
    )
    ON CONFLICT(style_influence_id) DO UPDATE SET status = 'active', pinned_flag = 0;

    INSERT INTO style_influence_combinations (
      combination_id, name, active_flag, created_at
    ) VALUES (
      'combo_prompt_curation_smoke',
      'Prompt Curation Smoke Combo',
      1,
      ${quote(now)}
    )
    ON CONFLICT(combination_id) DO UPDATE SET active_flag = 1;

    INSERT OR IGNORE INTO style_influence_combination_items (combination_id, style_influence_id)
    VALUES ('combo_prompt_curation_smoke', 'si_prompt_curation_smoke');

    INSERT INTO prompts (
      prompt_id, prompt_text, status, version, curated_flag, created_by, created_at
    ) VALUES (
      'prm_curation_smoke_deprecated',
      'prompt curation smoke text',
      'deprecated',
      'v1',
      0,
      'admin-curation-smoke-user',
      ${quote(older)}
    )
    ON CONFLICT(prompt_id) DO UPDATE SET
      prompt_text = 'prompt curation smoke text',
      status = 'deprecated',
      created_at = ${quote(older)};

    INSERT INTO prompts (
      prompt_id, prompt_text, status, version, curated_flag, created_by, created_at
    ) VALUES (
      'prm_curation_smoke_active',
      'prompt curation smoke text',
      'active',
      'v1',
      0,
      'admin-curation-smoke-user',
      ${quote(now)}
    )
    ON CONFLICT(prompt_id) DO UPDATE SET
      prompt_text = 'prompt curation smoke text',
      status = 'active',
      created_at = ${quote(now)};

    INSERT INTO recommendation_extractions (
      extraction_id, status, prompt_text, author, creation_time, source_job_id,
      model_family, model_version, model_selection_source,
      is_baseline, has_profile, has_sref,
      parser_version, metadata_raw_json, created_at, confirmed_at
    ) VALUES (
      'rex_prompt_curation_smoke',
      'extracted',
      'prompt curation smoke text',
      'smoke-user',
      ${quote(now)},
      'job_prompt_curation_smoke',
      'standard',
      '6.1',
      'default',
      0,
      0,
      0,
      'v1',
      '[]',
      ${quote(now)},
      NULL
    )
    ON CONFLICT(extraction_id) DO UPDATE SET
      status = 'extracted',
      prompt_text = 'prompt curation smoke text',
      confirmed_at = NULL;
    `
  );
}

async function postPromptCuration(baseUrl, adminToken, promptId, status, reason) {
  const response = await fetch(
    `${baseUrl}/admin/prompts/${promptId}/curation`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        status,
        reason,
      }),
    }
  );
  const json = await response.json();
  if (!response.ok) {
    throw new Error(`Prompt curation update failed (${response.status}): ${JSON.stringify(json)}`);
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

  const adminToken = buildToken("admin-curation-smoke-user");
  const consumerToken = buildToken("consumer-curation-smoke-user");
  const smokePort = process.env.SMOKE_API_PORT || "3016";
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

    const forbiddenResponse = await fetch(
      `${baseUrl}/admin/prompts/prm_curation_smoke_deprecated/curation`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${consumerToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          status: "experimental",
          reason: "forbidden-check",
        }),
      }
    );
    assertCondition(forbiddenResponse.status === 403, "Expected non-admin prompt curation call to return 403");

    const toExperimental = await postPromptCuration(
      baseUrl,
      adminToken,
      "prm_curation_smoke_deprecated",
      "experimental",
      "prompt curation smoke experimental"
    );
    assertCondition(
      toExperimental.prompt.status === "experimental",
      "Expected deprecated prompt to transition to experimental"
    );

    const backToDeprecated = await postPromptCuration(
      baseUrl,
      adminToken,
      "prm_curation_smoke_deprecated",
      "deprecated",
      "prompt curation smoke deprecated"
    );
    assertCondition(
      backToDeprecated.prompt.status === "deprecated",
      "Expected prompt to transition back to deprecated"
    );

    const curationViewResponse = await fetch(
      `${baseUrl}/admin/prompts/prm_curation_smoke_deprecated/curation`,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      }
    );
    const curationViewJson = await curationViewResponse.json();
    assertCondition(curationViewResponse.ok, "Expected prompt curation audit/status endpoint to succeed");
    assertCondition(
      Array.isArray(curationViewJson.actions) && curationViewJson.actions.length >= 2,
      "Expected prompt curation audit entries"
    );

    const confirmResponse = await fetch(
      `${baseUrl}/recommendation-extractions/rex_prompt_curation_smoke/confirm`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${consumerToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          confirmed: true,
          mode: "precision",
        }),
      }
    );
    const confirmJson = await confirmResponse.json();
    if (!confirmResponse.ok) {
      throw new Error(`Confirm endpoint failed (${confirmResponse.status}): ${JSON.stringify(confirmJson)}`);
    }
    const sessionId = confirmJson.session.sessionId;

    const sessionResponse = await fetch(`${baseUrl}/recommendation-sessions/${sessionId}`, {
      headers: {
        Authorization: `Bearer ${consumerToken}`,
      },
    });
    const sessionJson = await sessionResponse.json();
    if (!sessionResponse.ok) {
      throw new Error(`Session endpoint failed (${sessionResponse.status}): ${JSON.stringify(sessionJson)}`);
    }
    assertCondition(
      sessionJson.session.prompt.promptId === "prm_curation_smoke_active",
      "Expected default prompt selection to prefer active prompt variant"
    );
    assertCondition(
      sessionJson.session.prompt.status === "active",
      "Expected selected prompt status to be active"
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          forbiddenStatus: forbiddenResponse.status,
          finalDeprecatedPromptStatus: backToDeprecated.prompt.status,
          curationAuditCount: curationViewJson.actions.length,
          selectedPromptId: sessionJson.session.prompt.promptId,
          selectedPromptStatus: sessionJson.session.prompt.status,
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
