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

function seedData(dbPath) {
  const now = new Date().toISOString();
  runSql(
    dbPath,
    `
    INSERT INTO users (user_id, role, status, created_at, updated_at)
    VALUES ('admin-moderation-smoke-user', 'admin', 'active', ${quote(now)}, ${quote(now)})
    ON CONFLICT(user_id) DO UPDATE SET role = 'admin', status = 'active', updated_at = ${quote(now)};

    INSERT INTO users (user_id, role, status, created_at, updated_at)
    VALUES ('consumer-moderation-smoke-user', 'consumer', 'active', ${quote(now)}, ${quote(now)})
    ON CONFLICT(user_id) DO UPDATE SET role = 'consumer', status = 'active', updated_at = ${quote(now)};

    INSERT INTO analysis_jobs (
      job_id, idempotency_key, run_type, image_id, status, submitted_at, updated_at,
      model_family, model_version, model_selection_source, moderation_status, rerun_of_job_id
    ) VALUES (
      'job_epicd_moderation_smoke',
      'epicd-moderation-smoke-idem',
      'trait',
      'img_epicd_moderation_smoke',
      'succeeded',
      ${quote(now)},
      ${quote(now)},
      'standard',
      '6.1',
      'default',
      'none',
      NULL
    )
    ON CONFLICT(job_id) DO UPDATE SET
      status = 'succeeded',
      updated_at = ${quote(now)},
      moderation_status = 'none',
      rerun_of_job_id = NULL;

    INSERT INTO analysis_runs (
      analysis_run_id, job_id, status, attempt_count, started_at, completed_at,
      last_error_code, last_error_message, model_family, model_version
    ) VALUES (
      'run_epicd_moderation_smoke',
      'job_epicd_moderation_smoke',
      'succeeded',
      1,
      ${quote(now)},
      ${quote(now)},
      NULL,
      NULL,
      'standard',
      '6.1'
    )
    ON CONFLICT(analysis_run_id) DO UPDATE SET
      status = 'succeeded',
      completed_at = ${quote(now)};

    INSERT INTO image_trait_analyses (
      image_trait_analysis_id, analysis_run_id, job_id, image_id, trait_schema_version,
      trait_vector_json, evidence_summary, created_at
    ) VALUES (
      'ita_epicd_moderation_smoke',
      'run_epicd_moderation_smoke',
      'job_epicd_moderation_smoke',
      'img_epicd_moderation_smoke',
      'v1',
      '{"composition.subject_emphasis":0.8}',
      'Moderation smoke trait payload',
      ${quote(now)}
    )
    ON CONFLICT(image_trait_analysis_id) DO UPDATE SET
      evidence_summary = 'Moderation smoke trait payload',
      created_at = ${quote(now)};
    `
  );
}

async function postModeration(baseUrl, adminToken, action, reason) {
  const response = await fetch(
    `${baseUrl}/admin/analysis-jobs/job_epicd_moderation_smoke/moderation`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action,
        reason,
      }),
    }
  );
  const json = await response.json();
  if (!response.ok) {
    throw new Error(`${action} moderation failed (${response.status}): ${JSON.stringify(json)}`);
  }
  return json;
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

  const adminToken = buildToken("admin-moderation-smoke-user");
  const consumerToken = buildToken("consumer-moderation-smoke-user");
  const smokePort = process.env.SMOKE_API_PORT || "3015";
  const baseUrl = `http://127.0.0.1:${smokePort}/v1`;

  const apiProc = spawn("node", ["apps/api/src/index.js"], {
    env: {
      ...process.env,
      PORT: smokePort,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let apiStderr = "";
  apiProc.stderr.on("data", (chunk) => {
    apiStderr += chunk.toString("utf8");
  });

  try {
    await waitForHealth(baseUrl, adminToken);

    const forbiddenResponse = await fetch(
      `${baseUrl}/admin/analysis-jobs/job_epicd_moderation_smoke/moderation`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${consumerToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "flag",
          reason: "forbidden-check",
        }),
      }
    );
    assertCondition(forbiddenResponse.status === 403, "Expected non-admin moderation call to return 403");

    const flagJson = await postModeration(baseUrl, adminToken, "flag", "moderation smoke flag");
    assertCondition(flagJson.job.moderationStatus === "flagged", "Expected moderation status=flagged");

    const resultAfterFlagResponse = await fetch(
      `${baseUrl}/analysis-jobs/job_epicd_moderation_smoke/result`,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      }
    );
    const resultAfterFlagJson = await resultAfterFlagResponse.json();
    assertCondition(resultAfterFlagResponse.ok, "Expected analysis result lookup after flag to succeed");
    assertCondition(resultAfterFlagJson.result === null, "Expected flagged job to suppress active result payload");

    const rerunJson = await postModeration(baseUrl, adminToken, "re-run", "moderation smoke rerun");
    assertCondition(rerunJson.rerunJob && rerunJson.rerunJob.jobId, "Expected rerun job details");
    assertCondition(rerunJson.rerunJob.status === "queued", "Expected rerun job status=queued");
    assertCondition(
      rerunJson.rerunJob.rerunOfJobId === "job_epicd_moderation_smoke",
      "Expected rerun job to reference source job"
    );

    const moderationViewResponse = await fetch(
      `${baseUrl}/admin/analysis-jobs/job_epicd_moderation_smoke/moderation`,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      }
    );
    const moderationViewJson = await moderationViewResponse.json();
    assertCondition(moderationViewResponse.ok, "Expected moderation status endpoint to succeed");
    assertCondition(
      moderationViewJson.rerunJobs.some((entry) => entry.jobId === rerunJson.rerunJob.jobId),
      "Expected moderation view to include rerun job"
    );

    const removeJson = await postModeration(baseUrl, adminToken, "remove", "moderation smoke remove");
    assertCondition(removeJson.job.moderationStatus === "removed", "Expected moderation status=removed");

    const auditResponse = await fetch(
      `${baseUrl}/admin/analysis-jobs/job_epicd_moderation_smoke/moderation`,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      }
    );
    const auditJson = await auditResponse.json();
    assertCondition(auditResponse.ok, "Expected moderation audit/status lookup to succeed");
    assertCondition(Array.isArray(auditJson.actions) && auditJson.actions.length >= 3, "Expected moderation audit entries");

    console.log(
      JSON.stringify(
        {
          ok: true,
          forbiddenStatus: forbiddenResponse.status,
          flaggedStatus: flagJson.job.moderationStatus,
          resultSuppressedAfterFlag: resultAfterFlagJson.result === null,
          rerunJobId: rerunJson.rerunJob.jobId,
          rerunStatus: rerunJson.rerunJob.status,
          removedStatus: removeJson.job.moderationStatus,
          moderationAuditCount: auditJson.actions.length,
          smokePort,
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
