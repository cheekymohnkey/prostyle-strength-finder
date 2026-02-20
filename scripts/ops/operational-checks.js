const { parseDatabaseUrl, runSql } = require("../db/lib");
const { spawnSync } = require("child_process");

function requiredEnv(key) {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value.trim();
}

function optionalEnv(key, fallback) {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    return fallback;
  }
  return value.trim();
}

function parseIntEnv(key, fallback) {
  const raw = optionalEnv(key, String(fallback));
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Invalid integer for ${key}: ${raw}`);
  }
  return parsed;
}

function parseFloatEnv(key, fallback) {
  const raw = optionalEnv(key, String(fallback));
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid number for ${key}: ${raw}`);
  }
  return parsed;
}

function runAwsSqs(args, region, endpoint) {
  const full = ["sqs", ...args, "--region", region, "--output", "json"];
  if (endpoint) {
    full.push("--endpoint-url", endpoint);
  }
  const result = spawnSync("aws", full, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "aws sqs command failed").trim());
  }
  return result.stdout ? JSON.parse(result.stdout) : {};
}

function buildCheck(name, ok, details, severity = "fail") {
  return {
    name,
    ok,
    severity,
    details,
  };
}

function checkSqliteQueueAndErrors(config) {
  const dbPath = parseDatabaseUrl(config.databaseUrl);
  const queueUrl = config.queueUrl;
  const dlqUrl = config.dlqUrl;

  const queueRowsRaw = runSql(
    dbPath,
    `
    SELECT
      SUM(CASE WHEN queue_url = '${queueUrl.replace(/'/g, "''")}' AND status = 'queued' THEN 1 ELSE 0 END) AS primary_queued,
      SUM(CASE WHEN queue_url = '${queueUrl.replace(/'/g, "''")}' AND status = 'in_progress' THEN 1 ELSE 0 END) AS primary_in_progress,
      SUM(CASE WHEN queue_url = '${dlqUrl.replace(/'/g, "''")}' AND status = 'queued' THEN 1 ELSE 0 END) AS dlq_queued,
      MAX(
        CASE
          WHEN queue_url = '${queueUrl.replace(/'/g, "''")}' AND status = 'queued'
          THEN (strftime('%s','now') - strftime('%s', available_at))
          ELSE NULL
        END
      ) AS queue_lag_sec
    FROM queue_messages;
    `,
    { json: true }
  );
  const queueRow = queueRowsRaw ? JSON.parse(queueRowsRaw)[0] : {};
  const primaryQueued = Number(queueRow?.primary_queued || 0);
  const primaryInProgress = Number(queueRow?.primary_in_progress || 0);
  const dlqQueued = Number(queueRow?.dlq_queued || 0);
  const lagSec = Math.max(0, Number(queueRow?.queue_lag_sec || 0));

  const runRowsRaw = runSql(
    dbPath,
    `
    SELECT
      SUM(CASE WHEN status IN ('failed', 'dead_letter') THEN 1 ELSE 0 END) AS error_runs,
      SUM(CASE WHEN status IN ('succeeded', 'failed', 'dead_letter') THEN 1 ELSE 0 END) AS completed_runs
    FROM analysis_runs
    WHERE COALESCE(completed_at, started_at, datetime('now'))
      >= datetime('now', '-24 hours');
    `,
    { json: true }
  );
  const runRow = runRowsRaw ? JSON.parse(runRowsRaw)[0] : {};
  const errorRuns = Number(runRow?.error_runs || 0);
  const completedRuns = Number(runRow?.completed_runs || 0);

  return {
    mode: "sqlite",
    primaryQueued,
    primaryInProgress,
    dlqQueued,
    lagSec,
    errorRuns,
    completedRuns,
  };
}

function checkSqsQueue(config) {
  const primary = runAwsSqs(
    [
      "get-queue-attributes",
      "--queue-url",
      config.queueUrl,
      "--attribute-names",
      "ApproximateNumberOfMessages",
      "ApproximateNumberOfMessagesNotVisible",
      "ApproximateAgeOfOldestMessage",
    ],
    config.region,
    config.endpoint
  );
  const dlq = runAwsSqs(
    [
      "get-queue-attributes",
      "--queue-url",
      config.dlqUrl,
      "--attribute-names",
      "ApproximateNumberOfMessages",
      "ApproximateAgeOfOldestMessage",
    ],
    config.region,
    config.endpoint
  );
  const primaryAttrs = primary.Attributes || {};
  const dlqAttrs = dlq.Attributes || {};

  return {
    mode: "sqs",
    primaryQueued: Number(primaryAttrs.ApproximateNumberOfMessages || 0),
    primaryInProgress: Number(primaryAttrs.ApproximateNumberOfMessagesNotVisible || 0),
    dlqQueued: Number(dlqAttrs.ApproximateNumberOfMessages || 0),
    lagSec: Number(primaryAttrs.ApproximateAgeOfOldestMessage || 0),
    errorRuns: null,
    completedRuns: null,
  };
}

function main() {
  const queueMode = optionalEnv("QUEUE_ADAPTER_MODE", optionalEnv("APP_ENV", "local") === "local" ? "sqlite" : "sqs");
  const config = {
    queueUrl: requiredEnv("SQS_QUEUE_URL"),
    dlqUrl: requiredEnv("SQS_DLQ_URL"),
    databaseUrl: requiredEnv("DATABASE_URL"),
    region: requiredEnv("AWS_REGION"),
    endpoint: optionalEnv("S3_ENDPOINT_OVERRIDE", ""),
  };
  const maxQueueLagSec = parseIntEnv("OPS_MAX_QUEUE_LAG_SEC", 300);
  const maxDlqMessages = parseIntEnv("OPS_MAX_DLQ_MESSAGES", 0);
  const maxErrorRate = parseFloatEnv("OPS_MAX_ERROR_RATE", 0.25);
  const minErrorSample = parseIntEnv("OPS_MIN_ERROR_SAMPLE", 5);

  const metrics = queueMode === "sqs"
    ? checkSqsQueue(config)
    : checkSqliteQueueAndErrors(config);

  const checks = [];
  checks.push(
    buildCheck(
      "queue_lag",
      metrics.lagSec <= maxQueueLagSec,
      {
        queueMode: metrics.mode,
        lagSec: metrics.lagSec,
        thresholdSec: maxQueueLagSec,
        primaryQueued: metrics.primaryQueued,
        primaryInProgress: metrics.primaryInProgress,
      }
    )
  );
  checks.push(
    buildCheck(
      "dead_letter_pressure",
      metrics.dlqQueued <= maxDlqMessages,
      {
        queueMode: metrics.mode,
        deadLetterQueued: metrics.dlqQueued,
        threshold: maxDlqMessages,
      }
    )
  );

  if (metrics.mode === "sqlite") {
    const completedRuns = metrics.completedRuns || 0;
    const errorRuns = metrics.errorRuns || 0;
    const errorRate = completedRuns > 0 ? Number((errorRuns / completedRuns).toFixed(4)) : 0;
    if (completedRuns < minErrorSample) {
      checks.push(
        buildCheck(
          "error_rate_visibility",
          true,
          {
            status: "insufficient_sample",
            completedRuns,
            minSample: minErrorSample,
            errorRuns,
            errorRate,
            threshold: maxErrorRate,
          },
          "warn"
        )
      );
    } else {
      checks.push(
        buildCheck(
          "error_rate_visibility",
          errorRate <= maxErrorRate,
          {
            status: "sampled",
            completedRuns,
            minSample: minErrorSample,
            errorRuns,
            errorRate,
            threshold: maxErrorRate,
          }
        )
      );
    }
  } else {
    checks.push(
      buildCheck(
        "error_rate_visibility",
        true,
        {
          status: "not_available_in_sqs_mode",
          note: "Use centralized log metrics for worker error-rate in non-sqlite mode.",
        },
        "warn"
      )
    );
  }

  const failedChecks = checks.filter((check) => check.ok === false);
  console.log(
    JSON.stringify(
      {
        ok: failedChecks.length === 0,
        queueMode: metrics.mode,
        checks,
      },
      null,
      2
    )
  );
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
