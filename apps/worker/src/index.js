const crypto = require("crypto");
const { loadConfig } = require("./config");
const { assertDatabaseReady } = require("../../../scripts/db/runtime");
const {
  ensureReady,
  ensureJob,
  getJobByIdempotencyKey,
  updateJobStatus,
  getNextAttemptCount,
  insertAnalysisRun,
  updateAnalysisRun,
  insertImageTraitAnalysis,
  getStyleDnaRunById,
  updateStyleDnaRunStatus,
  insertStyleDnaRunResult,
  getStyleDnaImageById,
} = require("../../../scripts/db/repository");
const { createQueueAdapter } = require("../../../scripts/queue/adapter");
const { createStorageAdapter } = require("../../../packages/storage-adapter/src");
const {
  resolveModelSelection,
  setCurrentDefaultModels,
} = require("../../../scripts/models/model-versioning");
const { createTraitInferenceAdapter } = require("../../../scripts/inference/trait-adapter");
const { createStyleDnaInferenceAdapter } = require("../../../scripts/inference/style-dna-adapter");
const {
  parseAnalysisJobEnvelope,
  createAnalysisRunStatusEvent,
} = require("../../../packages/shared-contracts/src");

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

async function handleProcessingFailure({
  message,
  queue,
  config,
  dbPath,
  requestId,
  envelope,
  analysisRunId,
  attempt,
  processingError,
}) {
  const failedEvent = buildStatusEvent(analysisRunId, envelope.jobId, "failed", processingError);

  logJson("warn", "worker.job.lifecycle", {
    request_id: requestId,
    job_id: envelope.jobId,
    analysis_run_id: analysisRunId,
    status_event: failedEvent,
    attempt,
    max_attempts: config.queue.maxAttempts,
  });

  updateAnalysisRun(dbPath, analysisRunId, {
    status: "failed",
    completedAt: new Date().toISOString(),
    lastErrorCode: processingError.code,
    lastErrorMessage: processingError.message,
  });

  const styleDnaRunId = envelope.context?.styleDnaRunId;
  if (envelope.runType === "style_dna" && typeof styleDnaRunId === "string" && styleDnaRunId.trim() !== "") {
    if (attempt < config.queue.maxAttempts) {
      updateStyleDnaRunStatus(dbPath, styleDnaRunId, {
        status: "failed",
        analysisRunId,
        lastErrorCode: processingError.code,
        lastErrorMessage: processingError.message,
      });
    }
  }

  if (attempt < config.queue.maxAttempts) {
    const retryDelayMs = config.queue.retryBaseMs * 2 ** (attempt - 1);
    const retryingEvent = buildStatusEvent(analysisRunId, envelope.jobId, "retrying", processingError);
    logJson("info", "worker.job.lifecycle", {
      request_id: requestId,
      job_id: envelope.jobId,
      analysis_run_id: analysisRunId,
      status_event: retryingEvent,
      attempt,
      max_attempts: config.queue.maxAttempts,
      retry_delay_ms: retryDelayMs,
    });
    updateAnalysisRun(dbPath, analysisRunId, {
      status: "retrying",
      completedAt: new Date().toISOString(),
      lastErrorCode: processingError.code,
      lastErrorMessage: processingError.message,
    });
    updateJobStatus(dbPath, envelope.jobId, "retrying");
    await queue.requeue(message, retryDelayMs);
    return;
  }

  const deadLetterEvent = buildStatusEvent(analysisRunId, envelope.jobId, "dead_letter", processingError);
  logJson("error", "worker.job.lifecycle", {
    request_id: requestId,
    job_id: envelope.jobId,
    analysis_run_id: analysisRunId,
    status_event: deadLetterEvent,
    attempt,
    max_attempts: config.queue.maxAttempts,
    dead_letter_url: config.queue.dlqUrl,
  });
  updateAnalysisRun(dbPath, analysisRunId, {
    status: "dead_letter",
    completedAt: new Date().toISOString(),
    lastErrorCode: processingError.code,
    lastErrorMessage: processingError.message,
  });
  updateJobStatus(dbPath, envelope.jobId, "dead_letter");
  if (envelope.runType === "style_dna" && typeof styleDnaRunId === "string" && styleDnaRunId.trim() !== "") {
    updateStyleDnaRunStatus(dbPath, styleDnaRunId, {
      status: "dead_letter",
      analysisRunId,
      lastErrorCode: processingError.code,
      lastErrorMessage: processingError.message,
    });
  }
  await queue.deadLetter(message, processingError.message);
}

async function processMessage(message, queue, config, dbPath, traitInferenceAdapter, styleDnaInferenceAdapter, storageAdapter) {
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
  const requestId = envelope.context?.requestId || envelope.context?.request_id || null;

  const analysisRunId = `run_${envelope.jobId}_${crypto.randomUUID().slice(0, 8)}`;
  const modelSelection = resolveModelSelection({
    promptText: envelope.context?.promptText || envelope.context?.prompt || "",
    modelFamily: envelope.modelFamily,
    modelVersion: envelope.modelVersion,
    modelSelectionSource: envelope.modelSelectionSource,
  });
  const existingByIdempotency = getJobByIdempotencyKey(dbPath, envelope.idempotencyKey);
  if (existingByIdempotency && existingByIdempotency.job_id !== envelope.jobId) {
    logJson("info", "worker.job.duplicate_skipped", {
      request_id: requestId,
      job_id: envelope.jobId,
      analysis_run_id: analysisRunId,
      idempotency_key: envelope.idempotencyKey,
      original_job_id: existingByIdempotency.job_id,
      reason: "idempotency key already tracked by another job",
    });
    await queue.ack(message);
    return;
  }

  const job = ensureJob(dbPath, {
    jobId: envelope.jobId,
    idempotencyKey: envelope.idempotencyKey,
    runType: envelope.runType,
    imageId: envelope.imageId,
    status: "queued",
    submittedAt: envelope.submittedAt,
    modelFamily: modelSelection.modelFamily,
    modelVersion: modelSelection.modelVersion,
    modelSelectionSource: modelSelection.modelSelectionSource,
  });

  if (job.status === "succeeded") {
    logJson("info", "worker.job.duplicate_skipped", {
      request_id: requestId,
      job_id: envelope.jobId,
      analysis_run_id: analysisRunId,
      idempotency_key: envelope.idempotencyKey,
      reason: "job already succeeded",
    });
    await queue.ack(message);
    return;
  }

  const attempt = getNextAttemptCount(dbPath, envelope.jobId);
  updateJobStatus(dbPath, envelope.jobId, "in_progress");
  insertAnalysisRun(dbPath, {
    analysisRunId,
    jobId: envelope.jobId,
    status: "in_progress",
    attemptCount: attempt,
    startedAt: new Date().toISOString(),
    modelFamily: modelSelection.modelFamily,
    modelVersion: modelSelection.modelVersion,
  });

  const inProgressEvent = buildStatusEvent(analysisRunId, envelope.jobId, "in_progress");
  logJson("info", "worker.job.lifecycle", {
    request_id: requestId,
    job_id: envelope.jobId,
    analysis_run_id: analysisRunId,
    status_event: inProgressEvent,
    attempt,
    max_attempts: config.queue.maxAttempts,
  });

  if (shouldFailForAttempt(envelope, attempt)) {
    await handleProcessingFailure({
      message,
      queue,
      config,
      dbPath,
      requestId,
      envelope,
      analysisRunId,
      attempt,
      processingError: {
        code: "SIMULATED_FAILURE",
        message: "Simulated processing failure",
      },
    });
    return;
  }

  try {
    if (envelope.runType === "trait") {
      const inferred = await traitInferenceAdapter.infer({
        imageId: envelope.imageId,
        promptText: envelope.context?.promptText || envelope.context?.prompt || "",
        modelFamily: envelope.modelFamily,
        modelVersion: envelope.modelVersion,
        runContext: envelope.context || {},
      });
      insertImageTraitAnalysis(dbPath, {
        imageTraitAnalysisId: `ita_${crypto.randomUUID()}`,
        analysisRunId,
        jobId: envelope.jobId,
        imageId: envelope.imageId,
        traitSchemaVersion: inferred.traitSchemaVersion,
        traitVector: inferred.traitVector,
        evidenceSummary: inferred.evidenceSummary,
      });
    } else if (envelope.runType === "style_dna") {
      const styleDnaRunId = String(envelope.context?.styleDnaRunId || "").trim();
      if (!styleDnaRunId) {
        throw Object.assign(new Error("styleDnaRunId is required in context"), {
          code: "INVALID_STYLE_DNA_CONTEXT",
        });
      }
      const styleDnaRun = getStyleDnaRunById(dbPath, styleDnaRunId);
      if (!styleDnaRun) {
        throw Object.assign(new Error(`Style-DNA run not found: ${styleDnaRunId}`), {
          code: "STYLE_DNA_RUN_NOT_FOUND",
        });
      }
      updateStyleDnaRunStatus(dbPath, styleDnaRunId, {
        status: "in_progress",
        analysisRunId,
        lastErrorCode: null,
        lastErrorMessage: null,
      });

      const baselineImage = getStyleDnaImageById(dbPath, styleDnaRun.baseline_grid_image_id);
      const testImage = getStyleDnaImageById(dbPath, styleDnaRun.test_grid_image_id);
      if (!baselineImage || !testImage) {
        throw Object.assign(new Error("Style-DNA run image references are missing"), {
          code: "STYLE_DNA_IMAGE_NOT_FOUND",
        });
      }

      const baselineObject = await storageAdapter.getObject({ key: baselineImage.storage_key });
      const testObject = await storageAdapter.getObject({ key: testImage.storage_key });
      const comparison = await styleDnaInferenceAdapter.compare({
        styleInfluenceId: styleDnaRun.style_influence_id,
        styleAdjustmentType: styleDnaRun.style_adjustment_type,
        styleAdjustmentMidjourneyId: styleDnaRun.style_adjustment_midjourney_id,
        promptKey: styleDnaRun.prompt_key,
        stylizeTier: Number(styleDnaRun.stylize_tier || 0),
        baselineImageId: baselineImage.style_dna_image_id,
        baselineMimeType: baselineImage.mime_type || baselineObject.contentType,
        baselineImageBuffer: baselineObject.body,
        testImageId: testImage.style_dna_image_id,
        testMimeType: testImage.mime_type || testObject.contentType,
        testImageBuffer: testObject.body,
      });

      insertStyleDnaRunResult(dbPath, {
        styleDnaRunResultId: `sdrs_${crypto.randomUUID()}`,
        styleDnaRunId,
        llmRaw: comparison.profileAnalysis,
        atomicTraits: comparison.profileAnalysis.profile_analysis.extracted_traits,
        canonicalTraits: {
          dominantDnaTags: comparison.profileAnalysis.profile_analysis.dominant_dna_tags,
          vibeShift: comparison.profileAnalysis.profile_analysis.vibe_shift,
          deltaStrength: comparison.profileAnalysis.profile_analysis.delta_strength,
        },
        taxonomyVersion: "style_dna_v1",
        summary: comparison.profileAnalysis.profile_analysis.vibe_shift,
      });
      insertImageTraitAnalysis(dbPath, {
        imageTraitAnalysisId: `ita_${crypto.randomUUID()}`,
        analysisRunId,
        jobId: envelope.jobId,
        imageId: styleDnaRun.test_grid_image_id,
        traitSchemaVersion: "style_dna_v1",
        traitVector: {
          deltaStrength: comparison.profileAnalysis.profile_analysis.delta_strength.score_1_to_10,
          compositionAndStructure: comparison.profileAnalysis.profile_analysis.extracted_traits.composition_and_structure,
          lightingAndContrast: comparison.profileAnalysis.profile_analysis.extracted_traits.lighting_and_contrast,
          colorPalette: comparison.profileAnalysis.profile_analysis.extracted_traits.color_palette,
          textureAndMedium: comparison.profileAnalysis.profile_analysis.extracted_traits.texture_and_medium,
          dominantDnaTags: comparison.profileAnalysis.profile_analysis.dominant_dna_tags,
        },
        evidenceSummary: `style_dna_comparison_${comparison.provider}`,
      });
      updateStyleDnaRunStatus(dbPath, styleDnaRunId, {
        status: "succeeded",
        analysisRunId,
        lastErrorCode: null,
        lastErrorMessage: null,
      });
    }
  } catch (error) {
    await handleProcessingFailure({
      message,
      queue,
      config,
      dbPath,
      requestId,
      envelope,
      analysisRunId,
      attempt,
      processingError: {
        code: error.code || "PROCESSING_ERROR",
        message: error.message || "Worker processing error",
      },
    });
    return;
  }

  const succeededEvent = buildStatusEvent(analysisRunId, envelope.jobId, "succeeded");
  updateAnalysisRun(dbPath, analysisRunId, {
    status: "succeeded",
    completedAt: new Date().toISOString(),
    lastErrorCode: null,
    lastErrorMessage: null,
  });
  updateJobStatus(dbPath, envelope.jobId, "succeeded");

  logJson("info", "worker.job.lifecycle", {
    request_id: requestId,
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
  setCurrentDefaultModels({
    standard: config.models.defaultStandardVersion,
    niji: config.models.defaultNijiVersion,
  });
  const dbReadiness = assertDatabaseReady(config.database.databaseUrl);
  const dbPath = ensureReady(config.database.databaseUrl);
  const queue = createQueueAdapter(config);
  const queueHealth = await Promise.resolve(queue.healthcheck());
  const storageAdapter = createStorageAdapter({
    appEnv: config.runtime.appEnv,
    bucket: config.storage.bucket,
    region: config.storage.region,
    endpoint: config.storage.endpoint,
  });
  const storageHealth = await storageAdapter.healthcheck();
  const traitInferenceAdapter = createTraitInferenceAdapter(config);
  const styleDnaInferenceAdapter = createStyleDnaInferenceAdapter(config);
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
    trait_inference_mode: traitInferenceAdapter.mode,
    style_dna_inference_mode: styleDnaInferenceAdapter.mode,
    queue_mode: queueHealth.mode,
    queue_url: queueHealth.queueUrl,
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

    await processMessage(message, queue, config, dbPath, traitInferenceAdapter, styleDnaInferenceAdapter, storageAdapter);
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
