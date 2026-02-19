const { spawn } = require("child_process");
const { parseDatabaseUrl, ensureDbParentDir, ensureMigrationsTable, runSql } = require("../db/lib");
const { assertDatabaseReady } = require("../db/runtime");
const { listActiveStyleInfluenceCombinations } = require("../db/repository");

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
    VALUES ('admin-smoke-user', 'admin', 'active', ${quote(now)}, ${quote(now)})
    ON CONFLICT(user_id) DO UPDATE SET role = 'admin', status = 'active', updated_at = ${quote(now)};

    INSERT INTO users (user_id, role, status, created_at, updated_at)
    VALUES ('consumer-smoke-user', 'consumer', 'active', ${quote(now)}, ${quote(now)})
    ON CONFLICT(user_id) DO UPDATE SET role = 'consumer', status = 'active', updated_at = ${quote(now)};

    INSERT INTO style_influence_types (
      style_influence_type_id, type_key, label, parameter_prefix, related_parameter_name, description, enabled_flag
    ) VALUES (
      'sit_epicd_smoke',
      'profile_epicd_smoke',
      'Profile EpicD Smoke',
      '--profile',
      '--stylize',
      'Epic D governance smoke type',
      1
    )
    ON CONFLICT(style_influence_type_id) DO UPDATE SET enabled_flag = 1;

    INSERT INTO style_influences (
      style_influence_id, style_influence_type_id, influence_code, status, pinned_flag, created_by, created_at
    ) VALUES (
      'si_epicd_smoke',
      'sit_epicd_smoke',
      'p-epicd-smoke',
      'active',
      0,
      'admin-smoke-user',
      ${quote(now)}
    )
    ON CONFLICT(style_influence_id) DO UPDATE SET status = 'active', pinned_flag = 0;

    INSERT INTO style_influence_combinations (
      combination_id, name, active_flag, created_at
    ) VALUES (
      'combo_epicd_smoke',
      'Epic D Smoke Combo',
      1,
      ${quote(now)}
    )
    ON CONFLICT(combination_id) DO UPDATE SET active_flag = 1;

    INSERT OR IGNORE INTO style_influence_combination_items (combination_id, style_influence_id)
    VALUES ('combo_epicd_smoke', 'si_epicd_smoke');
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
  seedData(dbPath);

  const adminToken = buildToken("admin-smoke-user");
  const consumerToken = buildToken("consumer-smoke-user");
  const smokePort = process.env.SMOKE_API_PORT || "3014";
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
      `${baseUrl}/admin/style-influences/si_epicd_smoke/governance`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${consumerToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "pin",
          reason: "forbidden-check",
        }),
      }
    );
    assertCondition(forbiddenResponse.status === 403, "Expected non-admin governance call to return 403");

    const pinResponse = await fetch(
      `${baseUrl}/admin/style-influences/si_epicd_smoke/governance`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "pin",
          reason: "governance smoke pin",
        }),
      }
    );
    const pinJson = await pinResponse.json();
    if (!pinResponse.ok) {
      throw new Error(`Admin pin action failed (${pinResponse.status}): ${JSON.stringify(pinJson)}`);
    }
    assertCondition(pinJson.styleInfluence.pinned === true, "Expected style influence to be pinned");

    const disableResponse = await fetch(
      `${baseUrl}/admin/style-influences/si_epicd_smoke/governance`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "disable",
          reason: "governance smoke disable",
        }),
      }
    );
    const disableJson = await disableResponse.json();
    if (!disableResponse.ok) {
      throw new Error(`Admin disable action failed (${disableResponse.status}): ${JSON.stringify(disableJson)}`);
    }
    assertCondition(disableJson.styleInfluence.status === "disabled", "Expected style influence status=disabled");

    const auditResponse = await fetch(
      `${baseUrl}/admin/style-influences/si_epicd_smoke/audit`,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      }
    );
    const auditJson = await auditResponse.json();
    if (!auditResponse.ok) {
      throw new Error(`Audit fetch failed (${auditResponse.status}): ${JSON.stringify(auditJson)}`);
    }
    assertCondition(Array.isArray(auditJson.actions) && auditJson.actions.length >= 2, "Expected audit entries");

    const activeCombos = listActiveStyleInfluenceCombinations(dbPath);
    const comboPresent = activeCombos.some((entry) => entry.combination_id === "combo_epicd_smoke");
    assertCondition(comboPresent === false, "Expected disabled influence to be excluded from active combinations");

    console.log(
      JSON.stringify(
        {
          ok: true,
          forbiddenStatus: forbiddenResponse.status,
          pinnedStatus: pinJson.styleInfluence.status,
          pinnedFlag: pinJson.styleInfluence.pinned,
          disabledStatus: disableJson.styleInfluence.status,
          auditCount: auditJson.actions.length,
          comboPresentAfterDisable: comboPresent,
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
