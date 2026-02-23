const http = require("http");
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

function queryRows(dbPath, sql) {
  const raw = runSql(dbPath, sql, { json: true });
  return raw ? JSON.parse(raw) : [];
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
    VALUES ('admin-style-dna-schema-smoke-user', 'admin', 'active', ${quote(now)}, ${quote(now)})
    ON CONFLICT(user_id) DO UPDATE SET role = 'admin', status = 'active', updated_at = ${quote(now)};

    INSERT INTO style_influence_types (
      style_influence_type_id, type_key, label, parameter_prefix, related_parameter_name, description, enabled_flag
    ) VALUES (
      'sit_style_dna_schema_smoke',
      'sref_style_dna_schema_smoke',
      'SREF Style-DNA Schema Smoke',
      '--sref',
      '--stylize',
      'Style-DNA schema failure smoke type',
      1
    )
    ON CONFLICT(style_influence_type_id) DO UPDATE SET enabled_flag = 1;

    INSERT INTO style_influences (
      style_influence_id, style_influence_type_id, influence_code, status, pinned_flag, created_by, created_at
    ) VALUES (
      'si_style_dna_schema_smoke',
      'sit_style_dna_schema_smoke',
      'sref-schema-failure-smoke',
      'active',
      0,
      'admin-style-dna-schema-smoke-user',
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

function readQueueCounts(dbPath, queueUrl, dlqUrl) {
  const rows = queryRows(
    dbPath,
    `
    SELECT queue_url, COUNT(*) AS count
    FROM queue_messages
    WHERE queue_url IN (${quote(queueUrl)}, ${quote(dlqUrl)})
    GROUP BY queue_url;
    `
  );
  const counts = { primary: 0, deadLetter: 0 };
  for (const row of rows) {
    if (row.queue_url === queueUrl) {
      counts.primary = Number(row.count || 0);
    }
    if (row.queue_url === dlqUrl) {
      counts.deadLetter = Number(row.count || 0);
    }
  }
  return counts;
}

function startInvalidOpenAiServer(port) {
  let callCount = 0;
  let listening = false;
  const server = http.createServer((req, res) => {
    if (req.method === "POST" && req.url === "/chat/completions") {
      callCount += 1;
      req.resume();
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        id: "cmpl_schema_smoke",
        object: "chat.completion",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "not json",
            },
          },
        ],
      }));
      return;
    }
    res.statusCode = 404;
    res.end("not found");
  });

  return {
    async listen() {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => {
          listening = true;
          resolve();
        });
      });
    },
    async close() {
      if (!listening) {
        return;
      }
      await new Promise((resolve) => server.close(() => resolve()));
      listening = false;
    },
    calls() {
      return callCount;
    },
  };
}

async function main() {
  const databaseUrl = requireEnv("DATABASE_URL");
  const queueUrl = requireEnv("SQS_QUEUE_URL");
  const dlqUrl = requireEnv("SQS_DLQ_URL");
  requireEnv("COGNITO_ISSUER");
  requireEnv("COGNITO_AUDIENCE");
  const dbPath = parseDatabaseUrl(databaseUrl);
  ensureDbParentDir(dbPath);
  ensureMigrationsTable(dbPath);
  assertDatabaseReady(databaseUrl);
  seedData(dbPath);

  const adminToken = buildToken("admin-style-dna-schema-smoke-user");
  const smokePort = process.env.SMOKE_API_PORT || "3025";
  const openAiPort = process.env.SMOKE_OPENAI_PORT || "4025";
  const baseUrl = `http://127.0.0.1:${smokePort}/v1`;
  const openAiServer = startInvalidOpenAiServer(Number(openAiPort));
  let suiteId = "";
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
    await openAiServer.listen();

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
          fileName: "schema-smoke-baseline.png",
          mimeType: "image/png",
          fileBase64: ONE_PIXEL_PNG_BASE64,
        }),
      },
      201
    );
    const baselineImageId = baselineImageUpload?.image?.styleDnaImageId;
    assertCondition(typeof baselineImageId === "string" && baselineImageId !== "", "Missing baseline image id");
    createdImageIds.push(baselineImageId);

    suiteId = `suite_style_dna_schema_smoke_${Date.now()}`;
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
    await requestJson(
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
          fileName: "schema-smoke-test.png",
          mimeType: "image/png",
          fileBase64: ONE_PIXEL_PNG_BASE64,
        }),
      },
      201
    );
    const testGridImageId = testImageUpload?.image?.styleDnaImageId;
    assertCondition(typeof testGridImageId === "string" && testGridImageId !== "", "Missing test image id");
    createdImageIds.push(testGridImageId);

    const runSubmit = await requestJson(
      `${baseUrl}/admin/style-dna/runs`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          idempotencyKey: `style-dna-schema-failure-smoke:${Date.now()}`,
          styleInfluenceId: "si_style_dna_schema_smoke",
          baselineRenderSetId,
          styleAdjustmentType: "sref",
          styleAdjustmentMidjourneyId: "sref-schema-failure-123",
          promptKey,
          stylizeTier,
          testGridImageId,
        }),
      },
      202
    );
    const styleDnaRunId = runSubmit?.run?.styleDnaRunId;
    assertCondition(typeof styleDnaRunId === "string" && styleDnaRunId !== "", "Missing style-dna run id");

    const worker = spawnProcess("node", ["apps/worker/src/index.js"], {
      ...process.env,
      TRAIT_INFERENCE_MODE: "deterministic",
      STYLE_DNA_INFERENCE_MODE: "llm",
      OPENAI_API_KEY: process.env.OPENAI_API_KEY || "schema-smoke-dummy-key",
      OPENAI_MODEL: "gpt-5-mini",
      OPENAI_BASE_URL: `http://127.0.0.1:${openAiPort}`,
      SQS_MAX_ATTEMPTS: "1",
      SQS_RETRY_BASE_MS: "10",
      WORKER_RUN_ONCE: "true",
    });

    const workerExit = await waitForProcessExit(worker.proc, 20000);
    if (workerExit.code !== 0) {
      const logs = worker.getLogs();
      throw new Error(
        `Worker exited with code ${workerExit.code} signal ${workerExit.signal || "none"}\nSTDOUT:\n${logs.stdout}\nSTDERR:\n${logs.stderr}`
      );
    }

    let runDetail = null;
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
      if (runDetail?.run?.status === "dead_letter") {
        break;
      }
      await sleep(250);
    }

    assertCondition(openAiServer.calls() >= 1, "Expected worker to call OpenAI completion endpoint");
    assertCondition(runDetail?.run?.status === "dead_letter", `Expected dead_letter run status, got ${runDetail?.run?.status}`);
    assertCondition(runDetail?.result === null, "Expected no run result on schema failure");
    assertCondition(runDetail?.run?.lastErrorCode === "PROCESSING_ERROR", `Unexpected error code: ${runDetail?.run?.lastErrorCode}`);
    assertCondition(
      String(runDetail?.run?.lastErrorMessage || "").includes("LLM response missing JSON object"),
      `Unexpected error message: ${runDetail?.run?.lastErrorMessage || "(empty)"}`
    );

    const queueCounts = readQueueCounts(dbPath, queueUrl, dlqUrl);
    assertCondition(queueCounts.deadLetter >= 1, "Expected dead-letter queue to have at least one message");
    cleanupVerified = true;

    console.log(
      JSON.stringify(
        {
          ok: true,
          smokePort,
          openAiPort,
          styleDnaRunId,
          runStatus: runDetail.run.status,
          lastErrorCode: runDetail.run.lastErrorCode,
          lastErrorMessage: runDetail.run.lastErrorMessage,
          openAiCallCount: openAiServer.calls(),
          queueCounts,
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
    await openAiServer.close();
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
