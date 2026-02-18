const http = require("http");
const crypto = require("crypto");
const { loadConfig } = require("./config");
const { assertDatabaseReady } = require("../../../scripts/db/runtime");
const { createStorageAdapter } = require("../../../packages/storage-adapter/src");
const {
  CONTRACT_VERSION,
  validateAnalysisJobEnvelope,
  createApiErrorResponse,
} = require("../../../packages/shared-contracts/src");

const jobsById = new Map();
const jobIdByIdempotencyKey = new Map();

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

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function validateJwtShape(authHeader, config) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { ok: false, reason: "Missing bearer token" };
  }

  const token = authHeader.slice("Bearer ".length).trim();
  const segments = token.split(".");
  if (segments.length !== 3) {
    return { ok: false, reason: "JWT must have 3 segments" };
  }

  try {
    const payload = JSON.parse(base64UrlDecode(segments[1]));
    const iss = payload.iss;
    const aud = payload.aud;
    const audMatches = Array.isArray(aud) ? aud.includes(config.auth.audience) : aud === config.auth.audience;
    if (iss !== config.auth.issuer || !audMatches) {
      return { ok: false, reason: "JWT issuer or audience mismatch" };
    }
    return { ok: true, tokenPayload: payload };
  } catch (_error) {
    return { ok: false, reason: "JWT payload is not valid JSON" };
  }
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
  const envelope = {
    schemaVersion: CONTRACT_VERSION,
    jobId: crypto.randomUUID(),
    idempotencyKey: submitBody.idempotencyKey,
    runType: submitBody.runType,
    imageId: submitBody.imageId,
    submittedAt: new Date().toISOString(),
    priority: submitBody.priority || "normal",
    context: submitBody.context || {},
  };

  return validateAnalysisJobEnvelope(envelope);
}

async function requestHandler(req, res, config) {
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

  const authResult = validateJwtShape(req.headers.authorization, config);
  if (!authResult.ok) {
    sendError(res, 401, "UNAUTHORIZED", "Invalid authorization token", ctx, {
      reason: authResult.reason,
    });
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

      const existingJobId = jobIdByIdempotencyKey.get(body.idempotencyKey);
      if (existingJobId) {
        const existingJob = jobsById.get(existingJobId);
        sendJson(
          res,
          200,
          {
            reused: true,
            job: existingJob,
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
      };

      jobsById.set(jobRecord.jobId, jobRecord);
      jobIdByIdempotencyKey.set(jobRecord.idempotencyKey, jobRecord.jobId);

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
    const job = jobsById.get(jobId);

    if (!job) {
      sendError(res, 404, "NOT_FOUND", "Analysis job not found", ctx);
      return;
    }

    sendJson(
      res,
      200,
      {
        job,
      },
      ctx
    );
    return;
  }

  sendError(res, 404, "NOT_FOUND", "Route not found", ctx);
}

function main() {
  const config = loadConfig();
  const dbReadiness = assertDatabaseReady(config.database.databaseUrl);
  const storageAdapter = createStorageAdapter({
    appEnv: config.runtime.appEnv,
    bucket: config.storage.bucket,
    region: config.storage.region,
    endpoint: config.storage.endpoint,
  });
  const server = http.createServer((req, res) => {
    requestHandler(req, res, config).catch((error) => {
      const ctx = createRequestContext(req, config);
      logJson("error", "api.request.unhandled_error", {
        request_id: ctx.requestId,
        error: error.message,
      });
      sendError(res, 500, "INTERNAL_ERROR", "Unhandled server error", ctx);
    });
  });

  storageAdapter.healthcheck().then((storageHealth) => {
    server.listen(config.runtime.port, () => {
      logJson("info", "api.server.started", {
        port: config.runtime.port,
        app_env: config.runtime.appEnv,
        service: config.observability.serviceName,
        contract_version: CONTRACT_VERSION,
        database_path: dbReadiness.dbPath,
        storage_mode: storageHealth.mode,
        storage_bucket: storageHealth.bucket,
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
