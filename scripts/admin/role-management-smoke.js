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
    VALUES ('admin-role-mgmt-smoke-user', 'admin', 'active', ${quote(now)}, ${quote(now)})
    ON CONFLICT(user_id) DO UPDATE SET role = 'admin', status = 'active', updated_at = ${quote(now)};

    INSERT INTO users (user_id, role, status, created_at, updated_at)
    VALUES ('consumer-role-mgmt-smoke-user', 'consumer', 'active', ${quote(now)}, ${quote(now)})
    ON CONFLICT(user_id) DO UPDATE SET role = 'consumer', status = 'active', updated_at = ${quote(now)};

    INSERT INTO users (user_id, role, status, created_at, updated_at)
    VALUES ('non-admin-role-mgmt-smoke-user', 'consumer', 'active', ${quote(now)}, ${quote(now)})
    ON CONFLICT(user_id) DO UPDATE SET role = 'consumer', status = 'active', updated_at = ${quote(now)};
    `
  );
}

async function postUserRole(baseUrl, adminToken, userId, payload) {
  const response = await fetch(`${baseUrl}/admin/users/${encodeURIComponent(userId)}/role`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(`Role update failed (${response.status}): ${JSON.stringify(json)}`);
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

  const adminToken = buildToken("admin-role-mgmt-smoke-user");
  const targetToken = buildToken("consumer-role-mgmt-smoke-user");
  const nonAdminToken = buildToken("non-admin-role-mgmt-smoke-user");
  const smokePort = process.env.SMOKE_API_PORT || "3020";
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

    const getInitialResponse = await fetch(`${baseUrl}/admin/users/consumer-role-mgmt-smoke-user/role`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });
    const getInitialJson = await getInitialResponse.json();
    assertCondition(getInitialResponse.ok, "Expected admin user-role GET to succeed");
    assertCondition(getInitialJson.user.role === "consumer", "Expected initial role=consumer");
    assertCondition(getInitialJson.user.status === "active", "Expected initial status=active");

    const listUsersResponse = await fetch(
      `${baseUrl}/admin/users?role=consumer&status=active&q=role-mgmt-smoke&limit=20`,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      }
    );
    const listUsersJson = await listUsersResponse.json();
    if (!listUsersResponse.ok) {
      throw new Error(`Admin users list failed (${listUsersResponse.status}): ${JSON.stringify(listUsersJson)}`);
    }
    assertCondition(Array.isArray(listUsersJson.users), "Expected users list array");
    assertCondition(
      listUsersJson.users.some((item) => item.userId === "consumer-role-mgmt-smoke-user"),
      "Expected users list to include seeded consumer user"
    );
    assertCondition(listUsersJson.page && listUsersJson.page.limit === 20, "Expected users list page.limit=20");

    const pagedFirstResponse = await fetch(
      `${baseUrl}/admin/users?role=consumer&status=active&q=role-mgmt-smoke&limit=1`,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      }
    );
    const pagedFirstJson = await pagedFirstResponse.json();
    if (!pagedFirstResponse.ok) {
      throw new Error(`Admin users paged list failed (${pagedFirstResponse.status}): ${JSON.stringify(pagedFirstJson)}`);
    }
    assertCondition(Array.isArray(pagedFirstJson.users) && pagedFirstJson.users.length === 1, "Expected paged first response with 1 user");
    assertCondition(
      typeof pagedFirstJson.page?.nextCursor === "string" && pagedFirstJson.page.nextCursor.trim() !== "",
      "Expected paged first response to include nextCursor"
    );

    const pagedSecondResponse = await fetch(
      `${baseUrl}/admin/users?role=consumer&status=active&q=role-mgmt-smoke&limit=1&cursor=${encodeURIComponent(pagedFirstJson.page.nextCursor)}`,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      }
    );
    const pagedSecondJson = await pagedSecondResponse.json();
    if (!pagedSecondResponse.ok) {
      throw new Error(`Admin users paged next list failed (${pagedSecondResponse.status}): ${JSON.stringify(pagedSecondJson)}`);
    }
    assertCondition(Array.isArray(pagedSecondJson.users), "Expected paged second response users array");
    assertCondition(
      pagedSecondJson.users.every((item) => item.userId !== pagedFirstJson.users[0].userId),
      "Expected paged second response to exclude first-page user"
    );

    const forbiddenListResponse = await fetch(`${baseUrl}/admin/users?limit=20`, {
      headers: {
        Authorization: `Bearer ${nonAdminToken}`,
      },
    });
    assertCondition(forbiddenListResponse.status === 403, "Expected non-admin users list to return 403");

    const forbiddenUpdateResponse = await fetch(`${baseUrl}/admin/users/consumer-role-mgmt-smoke-user/role`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${nonAdminToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        role: "contributor",
        status: "active",
        reason: "forbidden-check",
      }),
    });
    assertCondition(forbiddenUpdateResponse.status === 403, "Expected non-admin role update to return 403");

    const promoteJson = await postUserRole(baseUrl, adminToken, "consumer-role-mgmt-smoke-user", {
      role: "contributor",
      status: "active",
      reason: "promote to contributor for smoke",
    });
    assertCondition(promoteJson.user.role === "contributor", "Expected updated role=contributor");
    assertCondition(promoteJson.user.status === "active", "Expected updated status=active");

    const contributorCreateResponse = await fetch(`${baseUrl}/contributor/submissions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${targetToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        influenceType: "profile",
        influenceCode: `profile-role-mgmt-smoke-${Date.now()}`,
        sourceImageId: "img_role_mgmt_smoke_1",
      }),
    });
    const contributorCreateJson = await contributorCreateResponse.json();
    if (!contributorCreateResponse.ok) {
      throw new Error(`Expected promoted user to access contributor create (${contributorCreateResponse.status}): ${JSON.stringify(contributorCreateJson)}`);
    }

    const disableJson = await postUserRole(baseUrl, adminToken, "consumer-role-mgmt-smoke-user", {
      role: "contributor",
      status: "disabled",
      reason: "disable user for smoke",
    });
    assertCondition(disableJson.user.status === "disabled", "Expected updated status=disabled");

    const disabledCreateResponse = await fetch(`${baseUrl}/contributor/submissions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${targetToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        influenceType: "profile",
        influenceCode: `profile-role-mgmt-disabled-smoke-${Date.now()}`,
        sourceImageId: "img_role_mgmt_smoke_2",
      }),
    });
    assertCondition(disabledCreateResponse.status === 403, "Expected disabled contributor to receive 403");

    const getFinalResponse = await fetch(`${baseUrl}/admin/users/consumer-role-mgmt-smoke-user/role`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });
    const getFinalJson = await getFinalResponse.json();
    assertCondition(getFinalResponse.ok, "Expected final admin user-role GET to succeed");
    assertCondition(getFinalJson.user.role === "contributor", "Expected final role=contributor");
    assertCondition(getFinalJson.user.status === "disabled", "Expected final status=disabled");
    assertCondition(Array.isArray(getFinalJson.actions) && getFinalJson.actions.length >= 2, "Expected role management audit entries");

    console.log(
      JSON.stringify(
        {
          ok: true,
          initialRole: getInitialJson.user.role,
          listedUsersCount: listUsersJson.users.length,
          pagedFirstCount: pagedFirstJson.users.length,
          pagedSecondCount: pagedSecondJson.users.length,
          forbiddenStatus: forbiddenUpdateResponse.status,
          forbiddenListStatus: forbiddenListResponse.status,
          promotedRole: promoteJson.user.role,
          promotedStatus: promoteJson.user.status,
          contributorCreateStatus: contributorCreateResponse.status,
          disabledStatus: disableJson.user.status,
          disabledContributorStatus: disabledCreateResponse.status,
          auditCount: getFinalJson.actions.length,
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
