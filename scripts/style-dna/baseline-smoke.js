const { spawn } = require("child_process");
const { parseDatabaseUrl, ensureDbParentDir, ensureMigrationsTable, runSql } = require("../db/lib");
const { assertDatabaseReady } = require("../db/runtime");

const ONE_PIXEL_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9VE6zJkAAAAASUVORK5CYII=";

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

async function requestJson(url, options, expectedStatus) {
  const response = await fetch(url, options);
  const json = await response.json().catch(() => ({}));
  if (response.status !== expectedStatus) {
    throw new Error(`Expected ${expectedStatus} for ${options.method || "GET"} ${url}, got ${response.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

function seedAdmin(dbPath) {
  const now = new Date().toISOString();
  runSql(
    dbPath,
    `
    INSERT INTO users (user_id, role, status, created_at, updated_at)
    VALUES ('admin-style-dna-baseline-smoke-user', 'admin', 'active', ${quote(now)}, ${quote(now)})
    ON CONFLICT(user_id) DO UPDATE SET role = 'admin', status = 'active', updated_at = ${quote(now)};
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
  seedAdmin(dbPath);

  const adminToken = buildToken("admin-style-dna-baseline-smoke-user");
  const smokePort = process.env.SMOKE_API_PORT || "3026";
  const baseUrl = `http://127.0.0.1:${smokePort}/v1`;

  const apiProc = spawn("node", ["apps/api/src/index.js"], {
    env: {
      ...process.env,
      PORT: smokePort,
      TRAIT_INFERENCE_MODE: process.env.TRAIT_INFERENCE_MODE || "deterministic",
      STYLE_DNA_INFERENCE_MODE: process.env.STYLE_DNA_INFERENCE_MODE || "deterministic",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let apiStderr = "";
  apiProc.stderr.on("data", (chunk) => {
    apiStderr += chunk.toString("utf8");
  });

  try {
    await waitForHealth(baseUrl, adminToken);

    const baselineImage = await requestJson(
      `${baseUrl}/admin/style-dna/images`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          imageKind: "baseline",
          fileName: "baseline-smoke-image.png",
          mimeType: "image/png",
          fileBase64: ONE_PIXEL_PNG_BASE64,
        }),
      },
      201
    );
    const testImage = await requestJson(
      `${baseUrl}/admin/style-dna/images`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          imageKind: "test",
          fileName: "baseline-smoke-test-image.png",
          mimeType: "image/png",
          fileBase64: ONE_PIXEL_PNG_BASE64,
        }),
      },
      201
    );
    const baselineImageId = baselineImage?.image?.styleDnaImageId;
    const testImageId = testImage?.image?.styleDnaImageId;
    assertCondition(Boolean(baselineImageId), "Missing baseline image id");
    assertCondition(Boolean(testImageId), "Missing test image id");

    const suiteId = `suite_style_dna_baseline_smoke_${Date.now()}`;
    const createS0 = await requestJson(
      `${baseUrl}/admin/style-dna/baseline-sets`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          mjModelFamily: "standard",
          mjModelVersion: "7",
          suiteId,
          parameterEnvelope: {
            aspectRatio: "16:9",
            seed: 777,
            styleRaw: true,
            stylizeTier: 0,
            styleWeight: 0,
          },
        }),
      },
      201
    );
    const baselineRenderSetIdS0 = createS0?.baselineRenderSet?.baselineRenderSetId;
    assertCondition(Boolean(baselineRenderSetIdS0), "Missing baseline render set id for s=0");

    const duplicateS0 = await requestJson(
      `${baseUrl}/admin/style-dna/baseline-sets`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          mjModelFamily: "standard",
          mjModelVersion: "7",
          suiteId,
          parameterEnvelope: {
            aspectRatio: "16:9",
            seed: 777,
            styleRaw: true,
            stylizeTier: 0,
            styleWeight: 0,
          },
        }),
      },
      200
    );
    assertCondition(duplicateS0?.duplicate === true, "Expected duplicate baseline set response");
    assertCondition(
      duplicateS0?.baselineRenderSet?.baselineRenderSetId === baselineRenderSetIdS0,
      "Expected duplicate baseline set id to match original"
    );

    const createS100 = await requestJson(
      `${baseUrl}/admin/style-dna/baseline-sets`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          mjModelFamily: "standard",
          mjModelVersion: "7",
          suiteId,
          parameterEnvelope: {
            aspectRatio: "16:9",
            seed: 777,
            styleRaw: true,
            stylizeTier: 100,
            styleWeight: 0,
          },
        }),
      },
      201
    );
    const baselineRenderSetIdS100 = createS100?.baselineRenderSet?.baselineRenderSetId;
    assertCondition(Boolean(baselineRenderSetIdS100), "Missing baseline render set id for s=100");
    assertCondition(
      baselineRenderSetIdS100 !== baselineRenderSetIdS0,
      "Expected separate baseline set for different stylize tier envelope"
    );

    await requestJson(
      `${baseUrl}/admin/style-dna/baseline-sets/${baselineRenderSetIdS0}/items`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          promptKey: "person_camera_16_9",
          stylizeTier: 0,
          gridImageId: baselineImageId,
        }),
      },
      200
    );

    const wrongKindResponse = await fetch(`${baseUrl}/admin/style-dna/baseline-sets/${baselineRenderSetIdS0}/items`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        promptKey: "person_camera_16_9",
        stylizeTier: 100,
        gridImageId: testImageId,
      }),
    });
    const wrongKindJson = await wrongKindResponse.json();
    assertCondition(wrongKindResponse.status === 409, `Expected 409 for non-baseline image kind, got ${wrongKindResponse.status}`);
    assertCondition(
      String(wrongKindJson?.message || wrongKindJson?.error?.message || "").includes("Baseline set items require baseline image kind"),
      `Unexpected wrong-kind message: ${JSON.stringify(wrongKindJson)}`
    );

    const list = await requestJson(
      `${baseUrl}/admin/style-dna/baseline-sets?suiteId=${encodeURIComponent(suiteId)}&limit=10`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      },
      200
    );
    const ids = new Set((list.baselineSets || []).map((item) => item.baselineRenderSetId));
    assertCondition(ids.has(baselineRenderSetIdS0), "Expected list to include s=0 baseline set");
    assertCondition(ids.has(baselineRenderSetIdS100), "Expected list to include s=100 baseline set");

    console.log(
      JSON.stringify(
        {
          ok: true,
          smokePort,
          suiteId,
          baselineRenderSetIdS0,
          baselineRenderSetIdS100,
          listedCount: list.baselineSets?.length || 0,
          wrongKindStatus: wrongKindResponse.status,
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
