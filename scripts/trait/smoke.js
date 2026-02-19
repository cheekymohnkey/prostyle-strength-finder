const { spawn } = require("child_process");
const { parseDatabaseUrl, ensureDbParentDir, ensureMigrationsTable } = require("../db/lib");
const { assertDatabaseReady } = require("../db/runtime");

function requireEnv(key) {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value.trim();
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function buildLocalToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlJson({ alg: "none", typ: "JWT" });
  const payload = base64UrlJson({
    iss: process.env.COGNITO_ISSUER,
    aud: process.env.COGNITO_AUDIENCE,
    sub: "smoke-trait-user",
    exp: now + 3600,
  });
  return `${header}.${payload}.sig`;
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
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
      // Not yet ready.
    }
    await sleep(200);
  }
  throw new Error("API healthcheck did not become ready in time");
}

async function waitForJob(baseUrl, token, jobId, expectedStatus) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await fetch(`${baseUrl}/analysis-jobs/${encodeURIComponent(jobId)}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const json = await response.json();
    if (!response.ok) {
      throw new Error(`Job status request failed (${response.status}): ${JSON.stringify(json)}`);
    }
    if (json.job?.status === expectedStatus) {
      return json.job;
    }
    await sleep(200);
  }
  throw new Error(`Job did not reach status ${expectedStatus} in time`);
}

async function main() {
  const databaseUrl = requireEnv("DATABASE_URL");
  requireEnv("COGNITO_ISSUER");
  requireEnv("COGNITO_AUDIENCE");
  const dbPath = parseDatabaseUrl(databaseUrl);
  ensureDbParentDir(dbPath);
  ensureMigrationsTable(dbPath);
  assertDatabaseReady(databaseUrl);

  const token = buildLocalToken();
  const smokePort = process.env.SMOKE_API_PORT || "3012";
  const baseUrl = `http://127.0.0.1:${smokePort}/v1`;
  const idempotencyKey = `trait-smoke-${Date.now()}`;
  const imageId = `img_trait_${Date.now()}`;

  const apiProc = spawn("node", ["apps/api/src/index.js"], {
    env: {
      ...process.env,
      PORT: smokePort,
      TRAIT_INFERENCE_MODE: "deterministic",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let apiStderr = "";
  apiProc.stderr.on("data", (chunk) => {
    apiStderr += chunk.toString("utf8");
  });

  try {
    await waitForHealth(baseUrl, token);

    const submitResponse = await fetch(`${baseUrl}/analysis-jobs`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        idempotencyKey,
        runType: "trait",
        imageId,
        context: {
          promptText: "moody editorial portrait --v 6",
        },
      }),
    });
    const submitJson = await submitResponse.json();
    if (!submitResponse.ok) {
      throw new Error(`Trait job submit failed (${submitResponse.status}): ${JSON.stringify(submitJson)}`);
    }
    assertCondition(submitJson.reused === false, "Expected first submit to create a new job");
    const jobId = submitJson.job?.jobId;
    assertCondition(Boolean(jobId), "Submit response missing jobId");

    const workerProc = spawn("node", ["apps/worker/src/index.js"], {
      env: {
        ...process.env,
        TRAIT_INFERENCE_MODE: "deterministic",
        WORKER_RUN_ONCE: "true",
        WORKER_POLL_INTERVAL_MS: "50",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let workerStderr = "";
    workerProc.stderr.on("data", (chunk) => {
      workerStderr += chunk.toString("utf8");
    });
    await new Promise((resolve, reject) => {
      workerProc.once("error", reject);
      workerProc.once("exit", (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`Worker exited with code ${code}: ${workerStderr}`));
      });
    });

    const job = await waitForJob(baseUrl, token, jobId, "succeeded");
    const resultResponse = await fetch(`${baseUrl}/analysis-jobs/${encodeURIComponent(jobId)}/result`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const resultJson = await resultResponse.json();
    if (!resultResponse.ok) {
      throw new Error(`Result endpoint failed (${resultResponse.status}): ${JSON.stringify(resultJson)}`);
    }
    const traitAnalysis = resultJson?.result?.traitAnalysis;
    assertCondition(Boolean(resultJson.latestRun), "Expected latestRun for completed job");
    assertCondition(Boolean(traitAnalysis), "Expected traitAnalysis for trait run");
    assertCondition(traitAnalysis.traitSchemaVersion === "v1", "Expected trait schema version v1");
    const traitKeys = Object.keys(traitAnalysis.traitVector || {});
    assertCondition(traitKeys.length === 8, "Expected 8 deterministic trait dimensions");

    const reusedResponse = await fetch(`${baseUrl}/analysis-jobs`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        idempotencyKey,
        runType: "trait",
        imageId,
      }),
    });
    const reusedJson = await reusedResponse.json();
    if (!reusedResponse.ok) {
      throw new Error(`Idempotent submit failed (${reusedResponse.status}): ${JSON.stringify(reusedJson)}`);
    }
    assertCondition(reusedJson.reused === true, "Expected idempotent submit to reuse job");
    assertCondition(reusedJson.job?.jobId === jobId, "Reused response returned unexpected jobId");

    console.log(
      JSON.stringify(
        {
          ok: true,
          job,
          latestRun: resultJson.latestRun,
          traitAnalysis,
          idempotency: {
            reused: reusedJson.reused,
            jobId: reusedJson.job?.jobId,
          },
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
