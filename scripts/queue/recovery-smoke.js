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

async function waitForJobStatus(baseUrl, token, jobId, expectedStatus) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
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
    await sleep(100);
  }
  throw new Error(`Job ${jobId} did not reach status ${expectedStatus} in time`);
}

function seedUsers(dbPath) {
  const now = new Date().toISOString();
  runSql(
    dbPath,
    `
    INSERT INTO users (user_id, role, status, created_at, updated_at)
    VALUES ('admin-queue-recovery-smoke-user', 'admin', 'active', ${quote(now)}, ${quote(now)})
    ON CONFLICT(user_id) DO UPDATE SET role = 'admin', status = 'active', updated_at = ${quote(now)};

    INSERT INTO users (user_id, role, status, created_at, updated_at)
    VALUES ('consumer-queue-recovery-smoke-user', 'consumer', 'active', ${quote(now)}, ${quote(now)})
    ON CONFLICT(user_id) DO UPDATE SET role = 'consumer', status = 'active', updated_at = ${quote(now)};
    `
  );
}

function readQueueCounts(dbPath, queueUrl, dlqUrl) {
  const output = runSql(
    dbPath,
    `
    SELECT queue_url, COUNT(*) AS count
    FROM queue_messages
    WHERE queue_url IN (${quote(queueUrl)}, ${quote(dlqUrl)})
    GROUP BY queue_url;
    `,
    { json: true }
  );
  const rows = output ? JSON.parse(output) : [];
  const counts = {
    primary: 0,
    deadLetter: 0,
  };
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
  seedUsers(dbPath);

  const adminToken = buildToken("admin-queue-recovery-smoke-user");
  const userToken = buildToken("consumer-queue-recovery-smoke-user");
  const smokePort = process.env.SMOKE_API_PORT || "3024";
  const baseUrl = `http://127.0.0.1:${smokePort}/v1`;

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

  let workerProc = null;
  let workerStderr = "";

  try {
    await waitForHealth(baseUrl, adminToken);

    const submitResponse = await fetch(`${baseUrl}/analysis-jobs`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${userToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        idempotencyKey: `queue-recovery-smoke-${Date.now()}`,
        runType: "trait",
        imageId: `img_queue_recovery_smoke_${Date.now()}`,
        context: {
          promptText: "queue recovery smoke prompt",
          forceFail: true,
        },
      }),
    });
    const submitJson = await submitResponse.json();
    if (!submitResponse.ok) {
      throw new Error(`Queue recovery smoke submit failed (${submitResponse.status}): ${JSON.stringify(submitJson)}`);
    }
    const originalJobId = submitJson.job?.jobId;
    assertCondition(typeof originalJobId === "string" && originalJobId.trim() !== "", "Submit response missing jobId");

    workerProc = spawn("node", ["apps/worker/src/index.js"], {
      env: {
        ...process.env,
        TRAIT_INFERENCE_MODE: "deterministic",
        WORKER_RUN_ONCE: "false",
        WORKER_POLL_INTERVAL_MS: "20",
        SQS_MAX_ATTEMPTS: "2",
        SQS_RETRY_BASE_MS: "10",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    workerProc.stderr.on("data", (chunk) => {
      workerStderr += chunk.toString("utf8");
    });

    const deadLetterJob = await waitForJobStatus(baseUrl, userToken, originalJobId, "dead_letter");
    assertCondition(deadLetterJob.status === "dead_letter", "Expected original job to reach dead_letter");

    if (workerProc) {
      workerProc.kill("SIGTERM");
      await sleep(150);
      if (!workerProc.killed) {
        workerProc.kill("SIGKILL");
      }
      workerProc = null;
    }

    const queueCountsAfterDeadLetter = readQueueCounts(dbPath, queueUrl, dlqUrl);
    assertCondition(queueCountsAfterDeadLetter.deadLetter >= 1, "Expected at least one DLQ message after dead_letter");

    const rerunResponse = await fetch(`${baseUrl}/admin/analysis-jobs/${encodeURIComponent(originalJobId)}/moderation`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "re-run",
        reason: "queue recovery smoke re-run",
      }),
    });
    const rerunJson = await rerunResponse.json();
    if (!rerunResponse.ok) {
      throw new Error(`Queue recovery moderation re-run failed (${rerunResponse.status}): ${JSON.stringify(rerunJson)}`);
    }
    assertCondition(Boolean(rerunJson.rerunJob?.jobId), "Expected rerun job to be created");
    assertCondition(rerunJson.rerunJob.status === "queued", "Expected rerun job status=queued");

    const rerunJobId = rerunJson.rerunJob.jobId;
    const queueCountsAfterRerun = readQueueCounts(dbPath, queueUrl, dlqUrl);
    assertCondition(queueCountsAfterRerun.primary >= 1, "Expected primary queue message after admin re-run");

    const recoveryWorker = spawn("node", ["apps/worker/src/index.js"], {
      env: {
        ...process.env,
        TRAIT_INFERENCE_MODE: "deterministic",
        WORKER_RUN_ONCE: "false",
        WORKER_POLL_INTERVAL_MS: "20",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let recoveryWorkerStderr = "";
    recoveryWorker.stderr.on("data", (chunk) => {
      recoveryWorkerStderr += chunk.toString("utf8");
    });

    const rerunSucceededJob = await waitForJobStatus(baseUrl, adminToken, rerunJobId, "succeeded");
    assertCondition(rerunSucceededJob.status === "succeeded", "Expected rerun job to succeed");

    recoveryWorker.kill("SIGTERM");
    await sleep(150);
    if (!recoveryWorker.killed) {
      recoveryWorker.kill("SIGKILL");
    }
    if (recoveryWorkerStderr.trim() !== "") {
      process.stderr.write(recoveryWorkerStderr);
    }

    const moderationViewResponse = await fetch(
      `${baseUrl}/admin/analysis-jobs/${encodeURIComponent(originalJobId)}/moderation`,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      }
    );
    const moderationViewJson = await moderationViewResponse.json();
    if (!moderationViewResponse.ok) {
      throw new Error(`Moderation view fetch failed (${moderationViewResponse.status}): ${JSON.stringify(moderationViewJson)}`);
    }
    assertCondition(
      Array.isArray(moderationViewJson.rerunJobs)
        && moderationViewJson.rerunJobs.some((job) => job.jobId === rerunJobId && job.status === "succeeded"),
      "Expected moderation view to include succeeded rerun job"
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          originalJobId,
          originalJobStatus: deadLetterJob.status,
          rerunJobId,
          rerunJobStatus: rerunSucceededJob.status,
          queueCountsAfterDeadLetter,
          queueCountsAfterRerun,
          smokePort,
        },
        null,
        2
      )
    );
  } finally {
    if (workerProc) {
      workerProc.kill("SIGTERM");
      await sleep(150);
      if (!workerProc.killed) {
        workerProc.kill("SIGKILL");
      }
      workerProc = null;
    }
    if (workerStderr.trim() !== "") {
      process.stderr.write(workerStderr);
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
