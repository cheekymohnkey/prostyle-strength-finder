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

function seedData(dbPath) {
  const now = new Date().toISOString();
  runSql(
    dbPath,
    `
    INSERT INTO users (user_id, role, status, created_at, updated_at)
    VALUES ('admin-style-dna-prompt-smoke-user', 'admin', 'active', ${quote(now)}, ${quote(now)})
    ON CONFLICT(user_id) DO UPDATE SET role = 'admin', status = 'active', updated_at = ${quote(now)};

    INSERT INTO style_influence_types (
      style_influence_type_id, type_key, label, parameter_prefix, related_parameter_name, description, enabled_flag
    ) VALUES (
      'sit_style_dna_prompt_smoke',
      'sref_style_dna_prompt_smoke',
      'SREF Style-DNA Prompt Smoke',
      '--sref',
      '--stylize',
      'Style-DNA prompt generation smoke type',
      1
    )
    ON CONFLICT(style_influence_type_id) DO UPDATE SET enabled_flag = 1;

    INSERT INTO style_influences (
      style_influence_id, style_influence_type_id, influence_code, status, pinned_flag, created_by, created_at
    ) VALUES (
      'si_style_dna_prompt_smoke',
      'sit_style_dna_prompt_smoke',
      '--sw 100',
      'active',
      0,
      'admin-style-dna-prompt-smoke-user',
      ${quote(now)}
    )
    ON CONFLICT(style_influence_id) DO UPDATE SET status = 'active', influence_code = '--sw 100';
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
  seedData(dbPath);

  const adminToken = buildToken("admin-style-dna-prompt-smoke-user");
  const smokePort = process.env.SMOKE_API_PORT || "3027";
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
          fileName: "prompt-smoke-baseline.png",
          mimeType: "image/png",
          fileBase64: ONE_PIXEL_PNG_BASE64,
        }),
      },
      201
    );
    const baselineImageId = baselineImage?.image?.styleDnaImageId;
    assertCondition(Boolean(baselineImageId), "Missing baseline image id");
    createdImageIds.push(baselineImageId);

    suiteId = `suite_style_dna_prompt_smoke_${Date.now()}`;
    const baselineSet = await requestJson(
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
    const baselineRenderSetId = baselineSet?.baselineRenderSet?.baselineRenderSetId;
    assertCondition(Boolean(baselineRenderSetId), "Missing baseline render set id");

    await requestJson(
      `${baseUrl}/admin/style-dna/baseline-sets/${baselineRenderSetId}/items`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          promptKey: "coffee_cup_table",
          stylizeTier: 0,
          gridImageId: baselineImageId,
        }),
      },
      200
    );
    await requestJson(
      `${baseUrl}/admin/style-dna/baseline-sets/${baselineRenderSetId}/items`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          promptKey: "person_camera",
          stylizeTier: 0,
          gridImageId: baselineImageId,
        }),
      },
      200
    );

    const srefJob = await requestJson(
      `${baseUrl}/admin/style-dna/prompt-jobs`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          styleInfluenceId: "si_style_dna_prompt_smoke",
          baselineRenderSetId,
          styleAdjustmentType: "sref",
          styleAdjustmentMidjourneyId: "sref-1967009800",
          stylizeTiers: [0, 1000],
        }),
      },
      201
    );
    const srefPrompts = srefJob?.prompts || [];
    assertCondition(srefPrompts.length === 4, `Expected 4 prompts for 2 keys x 2 tiers, got ${srefPrompts.length}`);
    assertCondition(srefPrompts[0].promptKey === "coffee_cup_table", "Unexpected first prompt ordering");
    assertCondition(srefPrompts[1].promptKey === "person_camera", "Unexpected second prompt ordering");
    assertCondition(srefPrompts[0].stylizeTier === 0, "Expected first tier to be 0");
    assertCondition(srefPrompts[2].stylizeTier === 1000, "Expected third tier to be 1000");
    assertCondition(
      srefPrompts[0].promptTextGenerated.includes("--sref sref-1967009800"),
      `Missing sref arg in generated prompt: ${srefPrompts[0].promptTextGenerated}`
    );
    assertCondition(
      srefPrompts[0].promptTextGenerated.includes("--sw 100"),
      `Missing style influence code in generated prompt: ${srefPrompts[0].promptTextGenerated}`
    );
    assertCondition(
      srefPrompts[0].promptTextGenerated.includes("--v 7"),
      `Missing model version arg in generated prompt: ${srefPrompts[0].promptTextGenerated}`
    );

    const profileJob = await requestJson(
      `${baseUrl}/admin/style-dna/prompt-jobs`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          styleInfluenceId: "si_style_dna_prompt_smoke",
          baselineRenderSetId,
          styleAdjustmentType: "profile",
          styleAdjustmentMidjourneyId: "profile-117944326",
          stylizeTiers: [100],
        }),
      },
      201
    );
    const profilePrompt = profileJob?.prompts?.[0]?.promptTextGenerated || "";
    assertCondition(profilePrompt.includes("--profile profile-117944326"), `Missing profile arg in generated prompt: ${profilePrompt}`);
    assertCondition(profilePrompt.includes("--stylize 100"), `Missing stylize arg in generated prompt: ${profilePrompt}`);
    assertCondition(profilePrompt.includes("--v 7"), `Missing model version arg in generated prompt: ${profilePrompt}`);
    cleanupVerified = true;

    console.log(
      JSON.stringify(
        {
          ok: true,
          smokePort,
          baselineRenderSetId,
          srefPromptCount: srefPrompts.length,
          profilePromptExample: profilePrompt,
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
