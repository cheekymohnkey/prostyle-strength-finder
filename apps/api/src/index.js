const http = require("http");
const crypto = require("crypto");
const { loadConfig } = require("./config");
const { verifyJwt } = require("../../../scripts/auth/jwt");
const { assertDatabaseReady } = require("../../../scripts/db/runtime");
const {
  ensureReady,
  getJobById,
  getJobByIdempotencyKey,
  insertJob,
  updateJobStatus,
  getRecommendationExtractionById,
  insertRecommendationExtraction,
  markRecommendationExtractionConfirmed,
} = require("../../../scripts/db/repository");
const { createQueueAdapter } = require("../../../scripts/queue/adapter");
const { createStorageAdapter } = require("../../../packages/storage-adapter/src");
const { normalizeMidjourneyMetadata } = require("../../../scripts/ingestion/midjourney-metadata");
const {
  resolveModelSelection,
  setCurrentDefaultModels,
} = require("../../../scripts/models/model-versioning");
const {
  CONTRACT_VERSION,
  validateRecommendationSubmitPayload,
  validateRecommendationExtractionPayload,
  validateRecommendationExtractionConfirmPayload,
  validateAnalysisJobEnvelope,
  createApiErrorResponse,
} = require("../../../packages/shared-contracts/src");

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function createRequestContext(req, config) {
  const existingRequestId = req.headers["x-request-id"];
  const requestId = typeof existingRequestId === "string" && existingRequestId.trim() !== ""
    ? existingRequestId.trim()
    : crypto.randomUUID();

  return {
    requestId,
    service: config.observability.serviceName,
  };
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

function sendJson(res, statusCode, payload, ctx) {
  res.writeHead(statusCode, {
    "content-type": "application/json",
    "x-request-id": ctx.requestId,
  });
  res.end(JSON.stringify(payload));
}

function sendError(res, statusCode, code, message, ctx, details) {
  const payload = createApiErrorResponse({
    code,
    message,
    requestId: ctx.requestId,
    details: details || null,
  });
  sendJson(res, statusCode, payload, ctx);
}

function createJobEnvelope(submitBody) {
  const promptText = typeof submitBody.prompt === "string"
    ? submitBody.prompt
    : (typeof submitBody.context?.promptText === "string"
      ? submitBody.context.promptText
      : (typeof submitBody.context?.prompt === "string" ? submitBody.context.prompt : ""));

  const modelSelection = resolveModelSelection({ promptText });
  const envelope = {
    schemaVersion: CONTRACT_VERSION,
    jobId: crypto.randomUUID(),
    idempotencyKey: submitBody.idempotencyKey,
    runType: submitBody.runType,
    imageId: submitBody.imageId,
    submittedAt: new Date().toISOString(),
    priority: submitBody.priority || "normal",
    context: submitBody.context || {},
    modelFamily: modelSelection.modelFamily,
    modelVersion: modelSelection.modelVersion,
    modelSelectionSource: modelSelection.modelSelectionSource,
  };

  return validateAnalysisJobEnvelope(envelope);
}

async function requestHandler(req, res, config, dbPath, queueAdapter) {
  const ctx = createRequestContext(req, config);
  const url = new URL(req.url, "http://localhost");
  const method = req.method || "GET";
  const path = url.pathname;

  logJson("info", "api.request", {
    request_id: ctx.requestId,
    method,
    path,
    service: ctx.service,
  });

  if (method === "GET" && path === "/v1/health") {
    sendJson(
      res,
      200,
      {
        status: "ok",
        appEnv: config.runtime.appEnv,
        contractVersion: CONTRACT_VERSION,
      },
      ctx
    );
    return;
  }

  try {
    await verifyJwt(req.headers.authorization, config);
  } catch (error) {
    sendError(res, 401, "UNAUTHORIZED", "Invalid authorization token", ctx, {
      reason: error.message,
    });
    return;
  }

  if (method === "POST" && path === "/v1/recommendation-extractions") {
    try {
      const body = await parseJsonBody(req);
      const payload = validateRecommendationExtractionPayload(body);
      const normalized = normalizeMidjourneyMetadata(payload);
      const extractionId = `rex_${crypto.randomUUID()}`;

      insertRecommendationExtraction(dbPath, {
        extractionId,
        status: "extracted",
        promptText: normalized.prompt,
        author: normalized.author,
        creationTime: normalized.creationTime,
        sourceJobId: normalized.jobId,
        modelFamily: normalized.modelFamily,
        modelVersion: normalized.modelVersion,
        modelSelectionSource: normalized.modelSelectionSource,
        isBaseline: normalized.isBaseline,
        hasProfile: normalized.hasProfile,
        hasSref: normalized.hasSref,
        parserVersion: normalized.parserVersion,
        metadataRaw: normalized.metadataRaw,
      });

      sendJson(
        res,
        201,
        {
          extraction: {
            extractionId,
            status: "extracted",
            prompt: normalized.prompt,
            author: normalized.author,
            creationTime: normalized.creationTime,
            sourceJobId: normalized.jobId,
            modelFamily: normalized.modelFamily,
            modelVersion: normalized.modelVersion,
            modelSelectionSource: normalized.modelSelectionSource,
            isBaseline: normalized.isBaseline,
            hasProfile: normalized.hasProfile,
            hasSref: normalized.hasSref,
            parserVersion: normalized.parserVersion,
          },
          requiresConfirmation: true,
        },
        ctx
      );
      return;
    } catch (error) {
      sendError(res, 400, "INVALID_REQUEST", "Extraction parsing failed", ctx, {
        reason: error.message,
      });
      return;
    }
  }

  if (method === "POST" && path.startsWith("/v1/recommendation-extractions/") && path.endsWith("/confirm")) {
    const extractionId = path.slice("/v1/recommendation-extractions/".length, -"/confirm".length);
    const extraction = getRecommendationExtractionById(dbPath, extractionId);

    if (!extraction) {
      sendError(res, 404, "NOT_FOUND", "Recommendation extraction not found", ctx);
      return;
    }

    try {
      const body = await parseJsonBody(req);
      validateRecommendationExtractionConfirmPayload(body);
      const submitPayload = validateRecommendationSubmitPayload({
        extractionId,
        mode: body.mode,
        confirmed: body.confirmed,
      });
      const confirmedAt = markRecommendationExtractionConfirmed(dbPath, extractionId);
      sendJson(
        res,
        200,
        {
          sessionDraft: {
            extractionId: submitPayload.extractionId,
            mode: submitPayload.mode,
            status: "confirmed",
            confirmedAt,
          },
        },
        ctx
      );
      return;
    } catch (error) {
      sendError(res, 400, "INVALID_REQUEST", "Confirmation failed validation", ctx, {
        reason: error.message,
      });
      return;
    }
  }

  if (method === "GET" && path.startsWith("/v1/recommendation-extractions/")) {
    const extractionId = path.slice("/v1/recommendation-extractions/".length);
    const extraction = getRecommendationExtractionById(dbPath, extractionId);

    if (!extraction) {
      sendError(res, 404, "NOT_FOUND", "Recommendation extraction not found", ctx);
      return;
    }

    sendJson(
      res,
      200,
      {
        extraction: {
          extractionId: extraction.extraction_id,
          status: extraction.status,
          prompt: extraction.prompt_text,
          author: extraction.author,
          creationTime: extraction.creation_time,
          sourceJobId: extraction.source_job_id,
          modelFamily: extraction.model_family,
          modelVersion: extraction.model_version,
          modelSelectionSource: extraction.model_selection_source,
          isBaseline: Boolean(extraction.is_baseline),
          hasProfile: Boolean(extraction.has_profile),
          hasSref: Boolean(extraction.has_sref),
          parserVersion: extraction.parser_version,
          createdAt: extraction.created_at,
          confirmedAt: extraction.confirmed_at,
          metadataRaw: JSON.parse(extraction.metadata_raw_json || "[]"),
        },
      },
      ctx
    );
    return;
  }

  if (method === "POST" && path === "/v1/analysis-jobs") {
    try {
      const body = await parseJsonBody(req);
      if (!body.idempotencyKey || !body.runType || !body.imageId) {
        sendError(res, 400, "INVALID_REQUEST", "Missing required submit fields", ctx, {
          required: ["idempotencyKey", "runType", "imageId"],
        });
        return;
      }

      const existingJob = getJobByIdempotencyKey(dbPath, body.idempotencyKey);
      if (existingJob) {
        sendJson(
          res,
          200,
          {
            reused: true,
            job: {
              jobId: existingJob.job_id,
              status: existingJob.status,
              runType: existingJob.run_type,
              imageId: existingJob.image_id,
              idempotencyKey: existingJob.idempotency_key,
              submittedAt: existingJob.submitted_at,
              modelFamily: existingJob.model_family,
              modelVersion: existingJob.model_version,
              modelSelectionSource: existingJob.model_selection_source,
            },
          },
          ctx
        );
        return;
      }

      const envelope = createJobEnvelope(body);
      const jobRecord = {
        jobId: envelope.jobId,
        status: "queued",
        runType: envelope.runType,
        imageId: envelope.imageId,
        idempotencyKey: envelope.idempotencyKey,
        submittedAt: envelope.submittedAt,
        modelFamily: envelope.modelFamily,
        modelVersion: envelope.modelVersion,
        modelSelectionSource: envelope.modelSelectionSource,
      };

      insertJob(dbPath, jobRecord);
      try {
        queueAdapter.enqueue({
          body: JSON.stringify(envelope),
        });
      } catch (error) {
        updateJobStatus(dbPath, jobRecord.jobId, "failed");
        sendError(res, 503, "QUEUE_UNAVAILABLE", "Unable to enqueue analysis job", ctx, {
          reason: error.message,
        });
        return;
      }

      logJson("info", "analysis.job.enqueued", {
        request_id: ctx.requestId,
        job_id: jobRecord.jobId,
        run_type: jobRecord.runType,
        status: jobRecord.status,
      });

      sendJson(
        res,
        202,
        {
          reused: false,
          job: jobRecord,
        },
        ctx
      );
      return;
    } catch (error) {
      sendError(res, 400, "INVALID_REQUEST", "Job submission failed validation", ctx, {
        reason: error.message,
      });
      return;
    }
  }

  if (method === "GET" && path.startsWith("/v1/analysis-jobs/")) {
    const jobId = path.slice("/v1/analysis-jobs/".length);
    const job = getJobById(dbPath, jobId);

    if (!job) {
      sendError(res, 404, "NOT_FOUND", "Analysis job not found", ctx);
      return;
    }

    sendJson(
      res,
      200,
      {
        job: {
          jobId: job.job_id,
          status: job.status,
          runType: job.run_type,
          imageId: job.image_id,
          idempotencyKey: job.idempotency_key,
          submittedAt: job.submitted_at,
          modelFamily: job.model_family,
          modelVersion: job.model_version,
          modelSelectionSource: job.model_selection_source,
        },
      },
      ctx
    );
    return;
  }

  sendError(res, 404, "NOT_FOUND", "Route not found", ctx);
}

function main() {
  const config = loadConfig();
  setCurrentDefaultModels({
    standard: config.models.defaultStandardVersion,
    niji: config.models.defaultNijiVersion,
  });
  const dbReadiness = assertDatabaseReady(config.database.databaseUrl);
  const dbPath = ensureReady(config.database.databaseUrl);
  const queueAdapter = createQueueAdapter(config);
  const storageAdapter = createStorageAdapter({
    appEnv: config.runtime.appEnv,
    bucket: config.storage.bucket,
    region: config.storage.region,
    endpoint: config.storage.endpoint,
  });
  const server = http.createServer((req, res) => {
    requestHandler(req, res, config, dbPath, queueAdapter).catch((error) => {
      const ctx = createRequestContext(req, config);
      logJson("error", "api.request.unhandled_error", {
        request_id: ctx.requestId,
        error: error.message,
      });
      sendError(res, 500, "INTERNAL_ERROR", "Unhandled server error", ctx);
    });
  });

  Promise.all([storageAdapter.healthcheck(), Promise.resolve(queueAdapter.healthcheck())]).then(([storageHealth, queueHealth]) => {
    server.listen(config.runtime.port, () => {
      logJson("info", "api.server.started", {
        port: config.runtime.port,
        app_env: config.runtime.appEnv,
        service: config.observability.serviceName,
        contract_version: CONTRACT_VERSION,
        database_path: dbReadiness.dbPath,
        storage_mode: storageHealth.mode,
        storage_bucket: storageHealth.bucket,
        queue_mode: queueHealth.mode,
        queue_url: queueHealth.queueUrl,
      });
    });
  }).catch((error) => {
    logJson("error", "api.storage.init_failed", {
      error: error.message,
    });
    process.exitCode = 1;
  });
}

main();
