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

function extractApiErrorCode(payload) {
  const top = payload || {};
  const error = typeof top.error === "object" && top.error ? top.error : {};
  const rawCode = error.code || top.code;
  return typeof rawCode === "string" ? rawCode : "";
}

function extractApiErrorText(payload) {
  const top = payload || {};
  const error = typeof top.error === "object" && top.error ? top.error : {};
  const details = typeof error.details === "object" && error.details ? error.details : {};
  const topDetails = typeof top.details === "object" && top.details ? top.details : {};
  return [
    error.message,
    details.reason,
    top.message,
    topDetails.reason,
  ]
    .filter((value) => typeof value === "string" && value.trim() !== "")
    .join(" | ")
    .toLowerCase();
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
    VALUES ('admin-style-dna-run-smoke-user', 'admin', 'active', ${quote(now)}, ${quote(now)})
    ON CONFLICT(user_id) DO UPDATE SET role = 'admin', status = 'active', updated_at = ${quote(now)};

    INSERT INTO users (user_id, role, status, created_at, updated_at)
    VALUES ('contributor-style-dna-run-smoke-user', 'contributor', 'active', ${quote(now)}, ${quote(now)})
    ON CONFLICT(user_id) DO UPDATE SET role = 'contributor', status = 'active', updated_at = ${quote(now)};

    INSERT INTO style_influence_types (
      style_influence_type_id, type_key, label, parameter_prefix, related_parameter_name, description, enabled_flag
    ) VALUES (
      'sit_style_dna_smoke',
      'sref_style_dna_smoke',
      'SREF Style-DNA Smoke',
      '--sref',
      '--stylize',
      'Style-DNA run smoke test type',
      1
    )
    ON CONFLICT(style_influence_type_id) DO UPDATE SET enabled_flag = 1;

    INSERT INTO style_influences (
      style_influence_id, style_influence_type_id, influence_code, status, pinned_flag, created_by, created_at
    ) VALUES (
      'si_style_dna_smoke',
      'sit_style_dna_smoke',
      'sref-smoke-influence',
      'active',
      0,
      'admin-style-dna-run-smoke-user',
      ${quote(now)}
    )
    ON CONFLICT(style_influence_id) DO UPDATE SET status = 'active';
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

function spawnProcess(command, args, env) {
  const proc = spawn(command, args, {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  proc.stdout.on("data", (chunk) => {
    stdout += chunk.toString("utf8");
  });
  proc.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });
  return { proc, getLogs: () => ({ stdout, stderr }) };
}

async function waitForProcessExit(proc, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      proc.kill("SIGTERM");
      setTimeout(() => proc.kill("SIGKILL"), 200);
      reject(new Error(`Process timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    proc.once("exit", (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    });
  });
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

  const adminToken = buildToken("admin-style-dna-run-smoke-user");
  const contributorToken = buildToken("contributor-style-dna-run-smoke-user");
  const smokePort = process.env.SMOKE_API_PORT || "3024";
  const baseUrl = `http://127.0.0.1:${smokePort}/v1`;
  const suiteId = `suite_style_dna_run_smoke_${Date.now()}`;
  const createdImageIds = [];
  let cleanupVerified = false;

  const api = spawnProcess("node", ["apps/api/src/index.js"], {
    ...process.env,
    PORT: smokePort,
    TRAIT_INFERENCE_MODE: process.env.TRAIT_INFERENCE_MODE || "deterministic",
    STYLE_DNA_INFERENCE_MODE: process.env.STYLE_DNA_INFERENCE_MODE || "deterministic",
  });

  try {
    await waitForHealth(baseUrl, adminToken);

    const forbiddenRunList = await requestJson(
      `${baseUrl}/admin/style-dna/runs?limit=5`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${contributorToken}`,
        },
      },
      403
    );
    assertCondition(extractApiErrorCode(forbiddenRunList) === "FORBIDDEN", "Expected FORBIDDEN code for contributor run list");
    assertCondition(
      extractApiErrorText(forbiddenRunList).includes("admin role is required"),
      "Expected contributor run list rejection to mention admin role"
    );

    const baselineImageUpload = await requestJson(
      `${baseUrl}/admin/style-dna/images`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          imageKind: "baseline",
          fileName: "run-smoke-baseline.png",
          mimeType: "image/png",
          fileBase64: ONE_PIXEL_PNG_BASE64,
        }),
      },
      201
    );
    const baselineImageId = baselineImageUpload?.image?.styleDnaImageId;
    assertCondition(typeof baselineImageId === "string" && baselineImageId !== "", "Missing baseline image id");
    createdImageIds.push(baselineImageId);

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
            aspectRatio: "3:4",
            styleWeight: 0,
          },
        }),
      },
      201
    );
    const baselineRenderSetId = baselineSet?.baselineRenderSet?.baselineRenderSetId;
    assertCondition(typeof baselineRenderSetId === "string" && baselineRenderSetId !== "", "Missing baseline render set id");

    const promptKey = "portrait_primary";
    const stylizeTier = 100;
    const baselineItem = await requestJson(
      `${baseUrl}/admin/style-dna/baseline-sets/${baselineRenderSetId}/items`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          promptKey,
          stylizeTier,
          gridImageId: baselineImageId,
        }),
      },
      200
    );
    assertCondition(baselineItem?.item?.gridImageId === baselineImageId, "Baseline set item did not persist baseline image");

    const nonControlBaselineSet = await requestJson(
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
            aspectRatio: "3:4",
            styleWeight: 100,
          },
        }),
      },
      201
    );
    const nonControlBaselineRenderSetId = nonControlBaselineSet?.baselineRenderSet?.baselineRenderSetId;
    assertCondition(
      typeof nonControlBaselineRenderSetId === "string" && nonControlBaselineRenderSetId !== "",
      "Missing non-control baseline render set id"
    );
    await requestJson(
      `${baseUrl}/admin/style-dna/baseline-sets/${nonControlBaselineRenderSetId}/items`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          promptKey,
          stylizeTier,
          gridImageId: baselineImageId,
        }),
      },
      200
    );

    const styleAdjustmentType = "sref";
    const styleAdjustmentMidjourneyId = "sref-123456789";
    const submittedTestEnvelope = {
      mjModelFamily: "standard",
      mjModelVersion: "7",
      aspectRatio: "3:4",
      stylizeTier,
      styleWeight: 1000,
    };
    const promptJob = await requestJson(
      `${baseUrl}/admin/style-dna/prompt-jobs`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          styleInfluenceId: "si_style_dna_smoke",
          baselineRenderSetId,
          styleAdjustmentType,
          styleAdjustmentMidjourneyId,
          stylizeTiers: [stylizeTier],
        }),
      },
      201
    );
    const generatedPrompt = promptJob?.prompts?.[0]?.promptTextGenerated || "";
    assertCondition(generatedPrompt.includes("--sref sref-123456789"), `Generated prompt missing sref adjustment: ${generatedPrompt}`);
    assertCondition(generatedPrompt.includes("--stylize 100"), `Generated prompt missing stylize tier: ${generatedPrompt}`);

    const testImageUpload = await requestJson(
      `${baseUrl}/admin/style-dna/images`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          imageKind: "test",
          fileName: "run-smoke-test.png",
          mimeType: "image/png",
          fileBase64: ONE_PIXEL_PNG_BASE64,
        }),
      },
      201
    );
    const testGridImageId = testImageUpload?.image?.styleDnaImageId;
    assertCondition(typeof testGridImageId === "string" && testGridImageId !== "", "Missing test image id");
    createdImageIds.push(testGridImageId);

    const forbiddenRunSubmit = await requestJson(
      `${baseUrl}/admin/style-dna/runs`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${contributorToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          idempotencyKey: `style-dna-run-smoke:contributor-forbidden:${Date.now()}`,
          styleInfluenceId: "si_style_dna_smoke",
          baselineRenderSetId,
          styleAdjustmentType,
          styleAdjustmentMidjourneyId,
          promptKey,
          stylizeTier,
          testGridImageId,
          submittedTestEnvelope,
        }),
      },
      403
    );
    assertCondition(extractApiErrorCode(forbiddenRunSubmit) === "FORBIDDEN", "Expected FORBIDDEN code for contributor run submit");
    assertCondition(
      extractApiErrorText(forbiddenRunSubmit).includes("admin role is required"),
      "Expected contributor run submit rejection to mention admin role"
    );

    const missingControlResponse = await fetch(
      `${baseUrl}/admin/style-dna/runs`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          idempotencyKey: `style-dna-run-smoke:missing-control:${Date.now()}`,
          styleInfluenceId: "si_style_dna_smoke",
          baselineRenderSetId: nonControlBaselineRenderSetId,
          styleAdjustmentType,
          styleAdjustmentMidjourneyId,
          promptKey,
          stylizeTier,
          testGridImageId,
          submittedTestEnvelope,
        }),
      }
    );
    const missingControlJson = await missingControlResponse.json().catch(() => ({}));
    assertCondition(
      missingControlResponse.status === 409,
      `Expected 409 when sref run baseline styleWeight is not control, got ${missingControlResponse.status}: ${JSON.stringify(missingControlJson)}`
    );
    const missingControlCode = String(missingControlJson?.error?.code || missingControlJson?.code || "");
    const missingControlMessage = String(missingControlJson?.error?.message || missingControlJson?.message || "");
    assertCondition(
      missingControlCode === "INVALID_STATE",
      `Expected INVALID_STATE code for missing control baseline, got ${JSON.stringify(missingControlJson)}`
    );
    assertCondition(
      missingControlMessage.includes("Matched-control baseline is required"),
      `Expected matched-control policy message, got: ${missingControlMessage || "(empty)"}`
    );

    const envelopeMismatchResponse = await fetch(
      `${baseUrl}/admin/style-dna/runs`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          idempotencyKey: `style-dna-run-smoke:envelope-mismatch:${Date.now()}`,
          styleInfluenceId: "si_style_dna_smoke",
          baselineRenderSetId,
          styleAdjustmentType,
          styleAdjustmentMidjourneyId,
          promptKey,
          stylizeTier,
          testGridImageId,
          submittedTestEnvelope: {
            ...submittedTestEnvelope,
            mjModelVersion: "6",
          },
        }),
      }
    );
    const envelopeMismatchJson = await envelopeMismatchResponse.json().catch(() => ({}));
    assertCondition(
      envelopeMismatchResponse.status === 409,
      `Expected 409 for envelope mismatch, got ${envelopeMismatchResponse.status}: ${JSON.stringify(envelopeMismatchJson)}`
    );
    assertCondition(
      extractApiErrorCode(envelopeMismatchJson) === "INVALID_STATE",
      `Expected INVALID_STATE for envelope mismatch, got ${JSON.stringify(envelopeMismatchJson)}`
    );
    assertCondition(
      extractApiErrorText(envelopeMismatchJson).includes("locked envelope mismatch"),
      `Expected locked envelope mismatch message, got ${JSON.stringify(envelopeMismatchJson)}`
    );

    const runIdempotencyKey = `style-dna-run-smoke:${Date.now()}`;
    const runSubmit = await requestJson(
      `${baseUrl}/admin/style-dna/runs`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          idempotencyKey: runIdempotencyKey,
          styleInfluenceId: "si_style_dna_smoke",
          baselineRenderSetId,
          styleAdjustmentType,
          styleAdjustmentMidjourneyId,
          promptKey,
          stylizeTier,
          testGridImageId,
          submittedTestEnvelope,
        }),
      },
      202
    );
    const styleDnaRunId = runSubmit?.run?.styleDnaRunId;
    assertCondition(typeof styleDnaRunId === "string" && styleDnaRunId !== "", "Missing style-dna run id");
    assertCondition(runSubmit?.run?.status === "queued", `Expected queued run status, got ${runSubmit?.run?.status}`);

    const forbiddenRunGet = await requestJson(
      `${baseUrl}/admin/style-dna/runs/${styleDnaRunId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${contributorToken}`,
        },
      },
      403
    );
    assertCondition(extractApiErrorCode(forbiddenRunGet) === "FORBIDDEN", "Expected FORBIDDEN code for contributor run get");
    assertCondition(
      extractApiErrorText(forbiddenRunGet).includes("admin role is required"),
      "Expected contributor run get rejection to mention admin role"
    );

    const deduplicatedRunSubmit = await requestJson(
      `${baseUrl}/admin/style-dna/runs`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          idempotencyKey: runIdempotencyKey,
          styleInfluenceId: "si_style_dna_smoke",
          baselineRenderSetId,
          styleAdjustmentType,
          styleAdjustmentMidjourneyId,
          promptKey,
          stylizeTier,
          testGridImageId,
          submittedTestEnvelope,
        }),
      },
      200
    );
    assertCondition(deduplicatedRunSubmit?.deduplicated === true, "Expected second idempotent run submit to be deduplicated");
    assertCondition(
      deduplicatedRunSubmit?.run?.styleDnaRunId === styleDnaRunId,
      `Expected deduplicated run id to match original run id, got ${deduplicatedRunSubmit?.run?.styleDnaRunId}`
    );

    const preWorkerRunDetail = await requestJson(
      `${baseUrl}/admin/style-dna/runs/${styleDnaRunId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      },
      200
    );
    assertCondition(preWorkerRunDetail?.run?.status === "queued", `Expected pre-worker queued status, got ${preWorkerRunDetail?.run?.status}`);
    assertCondition(!preWorkerRunDetail?.result, "Expected no run result before worker execution");

    const worker = spawnProcess("node", ["apps/worker/src/index.js"], {
      ...process.env,
      TRAIT_INFERENCE_MODE: "deterministic",
      STYLE_DNA_INFERENCE_MODE: "deterministic",
      WORKER_RUN_ONCE: "true",
    });

    const workerExit = await waitForProcessExit(worker.proc, 20000);
    if (workerExit.code !== 0) {
      const workerLogs = worker.getLogs();
      throw new Error(
        `Worker exited with code ${workerExit.code} signal ${workerExit.signal || "none"}\nSTDOUT:\n${workerLogs.stdout}\nSTDERR:\n${workerLogs.stderr}`
      );
    }

    let runDetail = null;
    let sawInProgress = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      runDetail = await requestJson(
        `${baseUrl}/admin/style-dna/runs/${styleDnaRunId}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        },
        200
      );
      if (runDetail?.run?.status === "in_progress") {
        sawInProgress = true;
      }
      if (runDetail?.run?.status === "succeeded" && runDetail?.result) {
        break;
      }
      await sleep(250);
    }

    assertCondition(runDetail?.run?.status === "succeeded", `Expected succeeded run status, got ${runDetail?.run?.status}`);
    assertCondition(
      sawInProgress || preWorkerRunDetail?.run?.status === "queued",
      "Expected observable lifecycle progression from queued to terminal state"
    );
    assertCondition(Boolean(runDetail?.run?.analysisRunId), "Expected analysisRunId on succeeded run");
    assertCondition(Boolean(runDetail?.result?.styleDnaRunResultId), "Expected run result row");
    assertCondition(runDetail?.result?.taxonomyVersion === "style_dna_v1", `Unexpected taxonomyVersion: ${runDetail?.result?.taxonomyVersion}`);
    assertCondition(
      Number(runDetail?.result?.canonicalTraits?.deltaStrength?.score_1_to_10 || 0) >= 1,
      `Invalid canonical deltaStrength score: ${JSON.stringify(runDetail?.result?.canonicalTraits?.deltaStrength)}`
    );
    cleanupVerified = true;

    console.log(
      JSON.stringify(
        {
          ok: true,
          smokePort,
          baselineRenderSetId,
          styleDnaRunId,
          runStatus: runDetail.run.status,
          resultId: runDetail.result.styleDnaRunResultId,
          providerSummary: runDetail.result.summary,
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
    api.proc.kill("SIGTERM");
    await sleep(200);
    if (!api.proc.killed) {
      api.proc.kill("SIGKILL");
    }
    const apiLogs = api.getLogs();
    if (apiLogs.stderr.trim() !== "") {
      process.stderr.write(apiLogs.stderr);
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
