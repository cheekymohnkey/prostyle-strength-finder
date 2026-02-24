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

function seedUsers(dbPath) {
  const now = new Date().toISOString();
  runSql(
    dbPath,
    `
    INSERT INTO users (user_id, role, status, created_at, updated_at)
    VALUES ('admin-style-dna-canonical-smoke-user', 'admin', 'active', ${quote(now)}, ${quote(now)})
    ON CONFLICT(user_id) DO UPDATE SET role = 'admin', status = 'active', updated_at = ${quote(now)};

    INSERT INTO users (user_id, role, status, created_at, updated_at)
    VALUES ('contributor-style-dna-canonical-smoke-user', 'contributor', 'active', ${quote(now)}, ${quote(now)})
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

  const adminToken = buildToken("admin-style-dna-canonical-smoke-user");
  const contributorToken = buildToken("contributor-style-dna-canonical-smoke-user");
  const smokePort = process.env.SMOKE_API_PORT || "3026";
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
    const canonicalDisplayLabel = `smoke spectral contour ${Date.now()}`;
    const aliasText = `spectral contouring ${Date.now()}`;

    const forbiddenCreate = await fetch(`${baseUrl}/admin/style-dna/canonical-traits`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${contributorToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        axis: "lighting_and_contrast",
        displayLabel: canonicalDisplayLabel,
      }),
    });
    assertCondition(forbiddenCreate.status === 403, `Expected contributor canonical create to return 403, got ${forbiddenCreate.status}`);

    const createResponse = await fetch(`${baseUrl}/admin/style-dna/canonical-traits`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        axis: "lighting_and_contrast",
        displayLabel: canonicalDisplayLabel,
        notes: "Canonical governance smoke creation.",
      }),
    });
    const createJson = await createResponse.json();
    assertCondition(createResponse.status === 201, `Expected canonical create 201, got ${createResponse.status}: ${JSON.stringify(createJson)}`);
    assertCondition(Boolean(createJson?.canonicalTrait?.canonicalTraitId), "Missing canonicalTraitId in create response");

    const canonicalTraitId = createJson.canonicalTrait.canonicalTraitId;

    const dedupeResponse = await fetch(`${baseUrl}/admin/style-dna/canonical-traits`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        axis: "lighting_and_contrast",
        displayLabel: canonicalDisplayLabel,
      }),
    });
    const dedupeJson = await dedupeResponse.json();
    assertCondition(dedupeResponse.status === 200, `Expected canonical dedupe 200, got ${dedupeResponse.status}`);
    assertCondition(Boolean(dedupeJson?.deduplicated), "Expected canonical dedupe response");

    const aliasCreate = await fetch(`${baseUrl}/admin/style-dna/trait-aliases`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        axis: "lighting_and_contrast",
        canonicalTraitId,
        aliasText,
        note: "Alias governance smoke creation.",
      }),
    });
    const aliasCreateJson = await aliasCreate.json();
    assertCondition(aliasCreate.status === 201, `Expected alias create 201, got ${aliasCreate.status}: ${JSON.stringify(aliasCreateJson)}`);
    assertCondition(Boolean(aliasCreateJson?.traitAlias?.aliasId), "Missing aliasId in alias create response");

    const aliasList = await fetch(`${baseUrl}/admin/style-dna/trait-aliases?axis=lighting_and_contrast`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });
    const aliasListJson = await aliasList.json();
    assertCondition(aliasList.status === 200, `Expected alias list 200, got ${aliasList.status}`);
    assertCondition(
      Array.isArray(aliasListJson?.traitAliases)
      && aliasListJson.traitAliases.some((row) => row.canonicalTraitId === canonicalTraitId),
      `Expected alias list to include canonical trait ${canonicalTraitId}`
    );

    const statusUpdate = await fetch(`${baseUrl}/admin/style-dna/canonical-traits/${encodeURIComponent(canonicalTraitId)}/status`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        status: "deprecated",
        note: "Canonical governance smoke deprecation.",
      }),
    });
    const statusUpdateJson = await statusUpdate.json();
    assertCondition(statusUpdate.status === 200, `Expected canonical status update 200, got ${statusUpdate.status}`);
    assertCondition(statusUpdateJson?.canonicalTrait?.status === "deprecated", "Expected canonical status to be deprecated");

    const deprecatedList = await fetch(`${baseUrl}/admin/style-dna/canonical-traits?status=deprecated&axis=lighting_and_contrast`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });
    const deprecatedListJson = await deprecatedList.json();
    assertCondition(deprecatedList.status === 200, `Expected canonical deprecated list 200, got ${deprecatedList.status}`);
    assertCondition(
      Array.isArray(deprecatedListJson?.canonicalTraits)
      && deprecatedListJson.canonicalTraits.some((row) => row.canonicalTraitId === canonicalTraitId),
      "Expected deprecated canonical trait to appear in filtered list"
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          canonicalTraitId,
          aliasId: aliasCreateJson.traitAlias.aliasId,
          forbiddenCreateStatus: forbiddenCreate.status,
          deprecatedStatus: statusUpdateJson.canonicalTrait.status,
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
