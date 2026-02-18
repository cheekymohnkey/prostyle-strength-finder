const crypto = require("crypto");
const { loadConfig } = require("./config");
const { assertDatabaseReady } = require("../../../scripts/db/runtime");
const { createStorageAdapter } = require("../../../packages/storage-adapter/src");
const { LocalQueueAdapter } = require("./queue-adapter");
const {
  parseAnalysisJobEnvelope,
  createAnalysisRunStatusEvent,
} = require("../../../packages/shared-contracts/src");

const processedByIdempotencyKey = new Map();
const attemptsByJobId = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseBooleanEnv(key, fallback) {
  const value = process.env[key];
  if (value === undefined) {
    return fallback;
  }
  return value === "true";
}

function parseIntegerEnv(key, fallback) {
  const value = process.env[key];
  if (value === undefined || value === "") {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Invalid integer for ${key}: ${value}`);
  }
  return parsed;
}

function logJson(level, message, fields) {
  console.log(
    JSON.stringify({
      level,
      message,
      timestamp: new Date().toISOString(),
      ...fields,
    })
  );
}

function nextAttempt(jobId) {
  const current = attemptsByJobId.get(jobId) || 0;
  const next = current + 1;
  attemptsByJobId.set(jobId, next);
  return next;
}

function buildStatusEvent(analysisRunId, jobId, status, error) {
  return createAnalysisRunStatusEvent({
    analysisRunId,
    jobId,
    status,
    errorCode: error ? error.code || "PROCESSING_ERROR" : null,
    errorMessage: error ? error.message || "Worker processing error" : null,
  });
}

function shouldFailForAttempt(envelope, attempt) {
  const context = envelope.context || {};
  if (context.forceFail === true) {
    return true;
  }
  if (Number.isInteger(context.failuresBeforeSuccess)) {
    return attempt <= context.failuresBeforeSuccess;
  }
  return false;
}

async function processMessage(message, queue, config) {
  let envelope;
  try {
    envelope = parseAnalysisJobEnvelope(message.body);
  } catch (error) {
    await queue.deadLetter(message, `Invalid envelope: ${error.message}`);
    logJson("error", "worker.job.invalid_envelope", {
      reason: error.message,
      receipt_handle: message.receiptHandle,
      queue_url: config.queue.queueUrl,
      dead_letter_url: config.queue.dlqUrl,
    });
    return;
  }

  const analysisRunId = `run_${envelope.jobId}_${crypto.randomUUID().slice(0, 8)}`;

  if (processedByIdempotencyKey.has(envelope.idempotencyKey)) {
    logJson("info", "worker.job.duplicate_skipped", {
      job_id: envelope.jobId,
      analysis_run_id: analysisRunId,
      idempotency_key: envelope.idempotencyKey,
      original_job_id: processedByIdempotencyKey.get(envelope.idempotencyKey),
    });
    await queue.ack(message);
    return;
  }

  const attempt = nextAttempt(envelope.jobId);
  const inProgressEvent = buildStatusEvent(analysisRunId, envelope.jobId, "in_progress");
  logJson("info", "worker.job.lifecycle", {
    job_id: envelope.jobId,
    analysis_run_id: analysisRunId,
    status_event: inProgressEvent,
    attempt,
    max_attempts: config.queue.maxAttempts,
  });

  if (shouldFailForAttempt(envelope, attempt)) {
    const processingError = {
      code: "SIMULATED_FAILURE",
      message: "Simulated processing failure",
    };
    const failedEvent = buildStatusEvent(analysisRunId, envelope.jobId, "failed", processingError);

    logJson("warn", "worker.job.lifecycle", {
      job_id: envelope.jobId,
      analysis_run_id: analysisRunId,
      status_event: failedEvent,
      attempt,
      max_attempts: config.queue.maxAttempts,
    });

    if (attempt < config.queue.maxAttempts) {
      const retryDelayMs = config.queue.retryBaseMs * 2 ** (attempt - 1);
      const retryingEvent = buildStatusEvent(analysisRunId, envelope.jobId, "retrying", processingError);
      logJson("info", "worker.job.lifecycle", {
        job_id: envelope.jobId,
        analysis_run_id: analysisRunId,
        status_event: retryingEvent,
        attempt,
        max_attempts: config.queue.maxAttempts,
        retry_delay_ms: retryDelayMs,
      });
      await queue.requeue(message, retryDelayMs);
      return;
    }

    const deadLetterEvent = buildStatusEvent(analysisRunId, envelope.jobId, "dead_letter", processingError);
    logJson("error", "worker.job.lifecycle", {
      job_id: envelope.jobId,
      analysis_run_id: analysisRunId,
      status_event: deadLetterEvent,
      attempt,
      max_attempts: config.queue.maxAttempts,
      dead_letter_url: config.queue.dlqUrl,
    });
    await queue.deadLetter(message, processingError.message);
    return;
  }

  const succeededEvent = buildStatusEvent(analysisRunId, envelope.jobId, "succeeded");
  processedByIdempotencyKey.set(envelope.idempotencyKey, envelope.jobId);

  logJson("info", "worker.job.lifecycle", {
    job_id: envelope.jobId,
    analysis_run_id: analysisRunId,
    status_event: succeededEvent,
    attempt,
    max_attempts: config.queue.maxAttempts,
  });

  await queue.ack(message);
}

async function runWorker() {
  const config = loadConfig();
  const dbReadiness = assertDatabaseReady(config.database.databaseUrl);
  const storageAdapter = createStorageAdapter({
    appEnv: config.runtime.appEnv,
    bucket: config.storage.bucket,
    region: config.storage.region,
    endpoint: config.storage.endpoint,
  });
  const storageHealth = await storageAdapter.healthcheck();
  const queue = new LocalQueueAdapter(config);
  const runOnce = parseBooleanEnv("WORKER_RUN_ONCE", true);
  const pollIntervalMs = parseIntegerEnv("WORKER_POLL_INTERVAL_MS", 750);
  let shuttingDown = false;

  const shutdown = () => {
    shuttingDown = true;
    logJson("info", "worker.shutdown.requested", {
      queue_url: config.queue.queueUrl,
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  logJson("info", "worker.started", {
    app_env: config.runtime.appEnv,
    queue_url: config.queue.queueUrl,
    dead_letter_url: config.queue.dlqUrl,
    run_once: runOnce,
    database_path: dbReadiness.dbPath,
    storage_mode: storageHealth.mode,
    storage_bucket: storageHealth.bucket,
  });

  while (!shuttingDown) {
    const message = await queue.poll();
    if (!message) {
      if (runOnce) {
        break;
      }
      await sleep(pollIntervalMs);
      continue;
    }

    await processMessage(message, queue, config);
  }

  logJson("info", "worker.stopped", {
    queue_url: config.queue.queueUrl,
  });
}

runWorker().catch((error) => {
  logJson("error", "worker.fatal", {
    error: error.message,
  });
  process.exitCode = 1;
});
