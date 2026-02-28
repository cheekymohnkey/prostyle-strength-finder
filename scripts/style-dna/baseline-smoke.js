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

async function requestJsonAllowStatus(url, options) {
  const response = await fetch(url, options);
  const json = await response.json().catch(() => ({}));
  return {
    status: response.status,
    json,
  };
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

function cleanupSmokeData(dbPath, input) {
  const suiteId = input.suiteId ? String(input.suiteId).trim() : "";
  if (!suiteId) {
    return;
  }
  const imageIds = Array.from(new Set((input.imageIds || []).filter(Boolean)));
  runSql(
    dbPath,
    `
    DELETE FROM style_dna_run_results
    WHERE style_dna_run_id IN (
      SELECT style_dna_run_id
      FROM style_dna_runs
      WHERE baseline_render_set_id IN (
        SELECT baseline_render_set_id
        FROM baseline_render_sets
        WHERE suite_id = ${quote(suiteId)}
      )
    );

    DELETE FROM style_dna_runs
    WHERE baseline_render_set_id IN (
      SELECT baseline_render_set_id
      FROM baseline_render_sets
      WHERE suite_id = ${quote(suiteId)}
    );

    DELETE FROM style_dna_prompt_job_items
    WHERE prompt_job_id IN (
      SELECT prompt_job_id
      FROM style_dna_prompt_jobs
      WHERE baseline_render_set_id IN (
        SELECT baseline_render_set_id
        FROM baseline_render_sets
        WHERE suite_id = ${quote(suiteId)}
      )
    );

    DELETE FROM style_dna_prompt_jobs
    WHERE baseline_render_set_id IN (
      SELECT baseline_render_set_id
      FROM baseline_render_sets
      WHERE suite_id = ${quote(suiteId)}
    );

    DELETE FROM baseline_render_set_items
    WHERE baseline_render_set_id IN (
      SELECT baseline_render_set_id
      FROM baseline_render_sets
      WHERE suite_id = ${quote(suiteId)}
    );

    DELETE FROM baseline_render_sets
    WHERE suite_id = ${quote(suiteId)};

    DELETE FROM baseline_prompt_suite_item_metadata
    WHERE suite_id = ${quote(suiteId)};

    DELETE FROM baseline_prompt_suite_items
    WHERE suite_id = ${quote(suiteId)};

    DELETE FROM baseline_prompt_suites
    WHERE suite_id = ${quote(suiteId)};
    `
  );
  if (imageIds.length > 0) {
    runSql(
      dbPath,
      `DELETE FROM style_dna_images
       WHERE style_dna_image_id IN (${imageIds.map((id) => quote(id)).join(", ")});`
    );
  }
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
  const strictProvenancePolicy = String(process.env.STYLE_DNA_REQUIRE_PROVENANCE_RECEIPT || "").trim().toLowerCase() === "true";
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
  let suiteId = "";
  const createdImageIds = [];
  let cleanupVerified = false;

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
          provenanceReceipt: {
            source: "midjourney_manual_export",
            capturedAtUtc: "2026-03-01T12:05:00Z",
            operatorAssertion: "grid captured from MJ job console export",
          },
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
          ...(strictProvenancePolicy
            ? {
              provenanceReceipt: {
                source: "midjourney_manual_export",
                capturedAtUtc: "2026-03-01T12:05:05Z",
                operatorAssertion: "test grid captured from MJ export",
              },
            }
            : {}),
        }),
      },
      201
    );
    const baselineImageId = baselineImage?.image?.styleDnaImageId;
    const testImageId = testImage?.image?.styleDnaImageId;
    assertCondition(Boolean(baselineImageId), "Missing baseline image id");
    assertCondition(Boolean(testImageId), "Missing test image id");
    const baselineImageSha = String(baselineImage?.image?.contentSha256 || "").trim();
    const testImageSha = String(testImage?.image?.contentSha256 || "").trim();
    assertCondition(/^[a-f0-9]{64}$/.test(baselineImageSha), "Expected baseline image contentSha256");
    assertCondition(/^[a-f0-9]{64}$/.test(testImageSha), "Expected test image contentSha256");
    assertCondition(baselineImageSha === testImageSha, "Expected identical digest for identical uploaded image bytes");
    assertCondition(
      baselineImage?.image?.provenanceSource === "midjourney_manual_export",
      "Expected explicit baseline provenanceSource"
    );
    assertCondition(
      baselineImage?.image?.provenanceCapturedAtUtc === "2026-03-01T12:05:00Z",
      "Expected explicit baseline provenanceCapturedAtUtc"
    );
    assertCondition(
      baselineImage?.image?.provenanceOperatorAssertion === "grid captured from MJ job console export",
      "Expected explicit baseline provenanceOperatorAssertion"
    );
    if (strictProvenancePolicy) {
      assertCondition(
        testImage?.image?.provenanceSource === "midjourney_manual_export",
        "Expected explicit test provenanceSource when strict policy enabled"
      );
      assertCondition(
        testImage?.image?.provenanceCapturedAtUtc === "2026-03-01T12:05:05Z",
        "Expected explicit test provenanceCapturedAtUtc when strict policy enabled"
      );
      const strictMissing = await requestJsonAllowStatus(
        `${baseUrl}/admin/style-dna/images`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${adminToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            imageKind: "test",
            fileName: "baseline-smoke-test-image-missing-provenance.png",
            mimeType: "image/png",
            fileBase64: ONE_PIXEL_PNG_BASE64,
          }),
        }
      );
      assertCondition(strictMissing.status === 400, "Expected 400 when provenanceReceipt missing under strict policy");
    } else {
      assertCondition(
        testImage?.image?.provenanceSource === "operator_upload_unverified",
        "Expected default test provenanceSource"
      );
      assertCondition(
        Number.isFinite(Date.parse(String(testImage?.image?.provenanceCapturedAtUtc || ""))),
        "Expected default test provenanceCapturedAtUtc"
      );
    }
    createdImageIds.push(baselineImageId, testImageId);

    suiteId = `suite_style_dna_baseline_smoke_${Date.now()}`;
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
    cleanupVerified = true;

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
    if (cleanupVerified) {
      cleanupSmokeData(dbPath, {
        suiteId,
        imageIds: createdImageIds,
      });
    }
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
