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
    VALUES ('contributor-essentials-smoke-user', 'contributor', 'active', ${quote(now)}, ${quote(now)})
    ON CONFLICT(user_id) DO UPDATE SET role = 'contributor', status = 'active', updated_at = ${quote(now)};

    INSERT INTO users (user_id, role, status, created_at, updated_at)
    VALUES ('contributor-essentials-other-user', 'contributor', 'active', ${quote(now)}, ${quote(now)})
    ON CONFLICT(user_id) DO UPDATE SET role = 'contributor', status = 'active', updated_at = ${quote(now)};

    INSERT INTO users (user_id, role, status, created_at, updated_at)
    VALUES ('consumer-essentials-smoke-user', 'consumer', 'active', ${quote(now)}, ${quote(now)})
    ON CONFLICT(user_id) DO UPDATE SET role = 'consumer', status = 'active', updated_at = ${quote(now)};

    INSERT INTO style_influence_types (
      style_influence_type_id, type_key, label, parameter_prefix, related_parameter_name, description, enabled_flag
    ) VALUES (
      'sit_profile_default',
      'profile',
      'Profile',
      '--profile',
      '--stylize',
      'Default contributor-managed profile type',
      1
    )
    ON CONFLICT(type_key) DO UPDATE SET
      style_influence_type_id = excluded.style_influence_type_id,
      label = excluded.label,
      parameter_prefix = excluded.parameter_prefix,
      related_parameter_name = excluded.related_parameter_name,
      description = excluded.description,
      enabled_flag = excluded.enabled_flag;

    INSERT INTO style_influences (
      style_influence_id, style_influence_type_id, influence_code, status, pinned_flag, created_by, created_at
    ) VALUES (
      'si_contrib_retry_smoke',
      'sit_profile_default',
      'profile-contrib-retry-smoke',
      'active',
      0,
      'contributor-essentials-smoke-user',
      ${quote(now)}
    )
    ON CONFLICT(style_influence_id) DO UPDATE SET
      style_influence_type_id = 'sit_profile_contrib_smoke',
      influence_code = 'profile-contrib-retry-smoke',
      status = 'active',
      pinned_flag = 0,
      created_by = 'contributor-essentials-smoke-user',
      created_at = ${quote(now)};

    INSERT INTO analysis_jobs (
      job_id, idempotency_key, run_type, image_id, status, submitted_at, updated_at,
      model_family, model_version, model_selection_source, moderation_status, rerun_of_job_id
    ) VALUES (
      'job_contrib_retry_failed_smoke',
      'contrib-retry-failed-smoke-idempotency',
      'trait',
      'img_contrib_retry_failed_smoke',
      'failed',
      ${quote(now)},
      ${quote(now)},
      'standard',
      '6',
      'default',
      'none',
      NULL
    )
    ON CONFLICT(job_id) DO UPDATE SET
      status = 'failed',
      updated_at = ${quote(now)},
      moderation_status = 'none',
      rerun_of_job_id = NULL;

    INSERT INTO contributor_submissions (
      submission_id, owner_user_id, style_influence_id, source_image_id, status, last_job_id, created_at, updated_at
    ) VALUES (
      'csub_contrib_retry_smoke',
      'contributor-essentials-smoke-user',
      'si_contrib_retry_smoke',
      'img_contrib_retry_failed_smoke',
      'failed',
      'job_contrib_retry_failed_smoke',
      ${quote(now)},
      ${quote(now)}
    )
    ON CONFLICT(submission_id) DO UPDATE SET
      owner_user_id = 'contributor-essentials-smoke-user',
      style_influence_id = 'si_contrib_retry_smoke',
      source_image_id = 'img_contrib_retry_failed_smoke',
      status = 'failed',
      last_job_id = 'job_contrib_retry_failed_smoke',
      updated_at = ${quote(now)};

    INSERT INTO style_influences (
      style_influence_id, style_influence_type_id, influence_code, status, pinned_flag, created_by, created_at
    ) VALUES (
      'si_contrib_foreign_smoke',
      'sit_profile_default',
      'profile-contrib-foreign-smoke',
      'active',
      0,
      'contributor-essentials-other-user',
      ${quote(now)}
    )
    ON CONFLICT(style_influence_id) DO UPDATE SET
      style_influence_type_id = 'sit_profile_contrib_smoke',
      influence_code = 'profile-contrib-foreign-smoke',
      status = 'active',
      pinned_flag = 0,
      created_by = 'contributor-essentials-other-user',
      created_at = ${quote(now)};

    INSERT INTO contributor_submissions (
      submission_id, owner_user_id, style_influence_id, source_image_id, status, last_job_id, created_at, updated_at
    ) VALUES (
      'csub_contrib_foreign_smoke',
      'contributor-essentials-other-user',
      'si_contrib_foreign_smoke',
      'img_contrib_foreign_smoke',
      'created',
      NULL,
      ${quote(now)},
      ${quote(now)}
    )
    ON CONFLICT(submission_id) DO UPDATE SET
      owner_user_id = 'contributor-essentials-other-user',
      style_influence_id = 'si_contrib_foreign_smoke',
      source_image_id = 'img_contrib_foreign_smoke',
      status = 'created',
      last_job_id = NULL,
      updated_at = ${quote(now)};
    `
  );
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

  const contributorToken = buildToken("contributor-essentials-smoke-user");
  const contributorOtherToken = buildToken("contributor-essentials-other-user");
  const consumerToken = buildToken("consumer-essentials-smoke-user");
  const smokePort = process.env.SMOKE_API_PORT || "3018";
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
    await waitForHealth(baseUrl, contributorToken);

    const forbiddenAdminResponse = await fetch(`${baseUrl}/admin/approval-policy`, {
      headers: {
        Authorization: `Bearer ${contributorToken}`,
      },
    });
    assertCondition(forbiddenAdminResponse.status === 403, "Expected contributor admin-policy access to return 403");

    const forbiddenConsumerCreateResponse = await fetch(`${baseUrl}/contributor/submissions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${consumerToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        influenceType: "profile",
        influenceCode: `profile-consumer-forbidden-${Date.now()}`,
        sourceImageId: "img_consumer_forbidden",
      }),
    });
    assertCondition(forbiddenConsumerCreateResponse.status === 403, "Expected non-contributor create to return 403");

    const createResponse = await fetch(`${baseUrl}/contributor/submissions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${contributorToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        influenceType: "sref",
        influenceCode: `sref-contrib-create-${Date.now()}`,
        sourceImageId: "img_contrib_create_smoke",
      }),
    });
    const createJson = await createResponse.json();
    if (!createResponse.ok) {
      throw new Error(`Contributor create submission failed (${createResponse.status}): ${JSON.stringify(createJson)}`);
    }
    const createdSubmissionId = createJson.submission?.submissionId;
    assertCondition(Boolean(createdSubmissionId), "Create response missing submissionId");
    assertCondition(createJson.submission.status === "created", "Expected created submission status=created");
    assertCondition(createJson.submission.styleInfluence.influenceType === "sref", "Expected inferred influenceType=sref");

    const listResponse = await fetch(`${baseUrl}/contributor/submissions`, {
      headers: {
        Authorization: `Bearer ${contributorToken}`,
      },
    });
    const listJson = await listResponse.json();
    if (!listResponse.ok) {
      throw new Error(`Contributor list submissions failed (${listResponse.status}): ${JSON.stringify(listJson)}`);
    }
    assertCondition(Array.isArray(listJson.submissions), "Expected submissions[] in list response");
    assertCondition(
      listJson.submissions.some((item) => item.submissionId === createdSubmissionId),
      "Expected list response to include created submission"
    );
    assertCondition(
      !listJson.submissions.some((item) => item.submissionId === "csub_contrib_foreign_smoke"),
      "Expected list response to exclude foreign-owner submissions"
    );

    const triggerResponse = await fetch(
      `${baseUrl}/contributor/submissions/${encodeURIComponent(createdSubmissionId)}/trigger`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${contributorToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          promptText: "moody editorial portrait --v 6",
        }),
      }
    );
    const triggerJson = await triggerResponse.json();
    if (!triggerResponse.ok) {
      throw new Error(`Contributor trigger failed (${triggerResponse.status}): ${JSON.stringify(triggerJson)}`);
    }
    assertCondition(
      ["queued", "pending_approval"].includes(triggerJson.submission.status),
      "Expected trigger status to be queued or pending_approval"
    );
    assertCondition(Boolean(triggerJson.submission.lastJobId), "Expected trigger response to include lastJobId");

    const getStatusResponse = await fetch(
      `${baseUrl}/contributor/submissions/${encodeURIComponent(createdSubmissionId)}`,
      {
        headers: {
          Authorization: `Bearer ${contributorToken}`,
        },
      }
    );
    const getStatusJson = await getStatusResponse.json();
    if (!getStatusResponse.ok) {
      throw new Error(`Contributor status read failed (${getStatusResponse.status}): ${JSON.stringify(getStatusJson)}`);
    }
    assertCondition(getStatusJson.submission.submissionId === createdSubmissionId, "Expected status to return created submission");
    assertCondition(Array.isArray(getStatusJson.actions) && getStatusJson.actions.length >= 2, "Expected create+trigger actions");

    const forbiddenForeignResponse = await fetch(
      `${baseUrl}/contributor/submissions/${encodeURIComponent(createdSubmissionId)}`,
      {
        headers: {
          Authorization: `Bearer ${contributorOtherToken}`,
        },
      }
    );
    assertCondition(forbiddenForeignResponse.status === 403, "Expected foreign-owner status read to return 403");

    const retryResponse = await fetch(`${baseUrl}/contributor/submissions/csub_contrib_retry_smoke/retry`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${contributorToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        promptText: "retry smoke prompt --v 6",
      }),
    });
    const retryJson = await retryResponse.json();
    if (!retryResponse.ok) {
      throw new Error(`Contributor retry failed (${retryResponse.status}): ${JSON.stringify(retryJson)}`);
    }
    assertCondition(
      ["queued", "pending_approval"].includes(retryJson.submission.status),
      "Expected retry status to be queued or pending_approval"
    );
    assertCondition(Boolean(retryJson.submission.lastJob?.rerunOfJobId), "Expected retry job to set rerunOfJobId");

    console.log(
      JSON.stringify(
        {
          ok: true,
          createdSubmissionId,
          ownSubmissionCount: listJson.submissions.length,
          triggerStatus: triggerJson.submission.status,
          statusReadActions: getStatusJson.actions.length,
          retryStatus: retryJson.submission.status,
          retryRerunOfJobId: retryJson.submission.lastJob.rerunOfJobId,
          forbiddenChecks: {
            consumerCreateStatus: forbiddenConsumerCreateResponse.status,
            foreignOwnerStatus: forbiddenForeignResponse.status,
            adminEndpointStatus: forbiddenAdminResponse.status,
          },
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
