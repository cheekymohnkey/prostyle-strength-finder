const { spawn } = require("child_process");
const net = require("net");
const { parseDatabaseUrl, ensureDbParentDir, ensureMigrationsTable, runSql } = require("../db/lib");
const { assertDatabaseReady } = require("../db/runtime");

function quote(value) {
  if (value === null || value === undefined) {
    return "NULL";
  }
  return `'${String(value).replace(/'/g, "''")}'`;
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

function canBindPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

async function pickAvailablePort(startPort, maxAttempts = 40) {
  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const candidate = startPort + offset;
    // eslint-disable-next-line no-await-in-loop
    if (await canBindPort(candidate)) {
      return String(candidate);
    }
  }
  throw new Error(`No available port found near ${startPort}`);
}

function requireEnv(key) {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value.trim();
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function hasDatabaseLockedError(payload) {
  const detailReason = payload?.details?.reason;
  const message = payload?.message;
  const merged = [detailReason, message].filter(Boolean).join(" | ").toLowerCase();
  return merged.includes("database is locked");
}

async function postJsonWithDbRetry(url, init, label, maxAttempts = 6) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    const response = await fetch(url, init);
    // eslint-disable-next-line no-await-in-loop
    const json = await response.json();
    if (response.ok) {
      return { response, json };
    }
    if (hasDatabaseLockedError(json.error) && attempt < maxAttempts) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(120 * attempt);
      // eslint-disable-next-line no-continue
      continue;
    }
    throw new Error(`${label} (${response.status}): ${JSON.stringify(json)}`);
  }
  throw new Error(`${label}: exhausted retries`);
}

function seedData(dbPath) {
  const now = new Date().toISOString();
  const older = new Date(Date.now() - 60_000).toISOString();
  runSql(
    dbPath,
    `
    INSERT INTO users (user_id, role, status, created_at, updated_at)
    VALUES ('admin-frontend-proxy-smoke-user', 'admin', 'active', ${quote(now)}, ${quote(now)})
    ON CONFLICT(user_id) DO UPDATE SET role = 'admin', status = 'active', updated_at = ${quote(now)};

    INSERT INTO users (user_id, role, status, created_at, updated_at)
    VALUES ('contributor-frontend-proxy-smoke-user', 'contributor', 'active', ${quote(now)}, ${quote(now)})
    ON CONFLICT(user_id) DO UPDATE SET role = 'contributor', status = 'active', updated_at = ${quote(now)};

    INSERT INTO users (user_id, role, status, created_at, updated_at)
    VALUES ('contributor-frontend-proxy-other-user', 'contributor', 'active', ${quote(now)}, ${quote(now)})
    ON CONFLICT(user_id) DO UPDATE SET role = 'contributor', status = 'active', updated_at = ${quote(now)};

    INSERT INTO users (user_id, role, status, created_at, updated_at)
    VALUES ('consumer-frontend-proxy-smoke-user', 'consumer', 'active', ${quote(now)}, ${quote(now)})
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
      'si_frontend_proxy_retry_smoke',
      'sit_profile_default',
      'profile-frontend-proxy-retry-smoke',
      'active',
      0,
      'contributor-frontend-proxy-smoke-user',
      ${quote(now)}
    )
    ON CONFLICT(style_influence_id) DO UPDATE SET
      status = 'active',
      pinned_flag = 0,
      created_by = 'contributor-frontend-proxy-smoke-user',
      created_at = ${quote(now)};

    INSERT INTO analysis_jobs (
      job_id, idempotency_key, run_type, image_id, status, submitted_at, updated_at,
      model_family, model_version, model_selection_source, moderation_status, rerun_of_job_id
    ) VALUES (
      'job_frontend_proxy_retry_failed_smoke',
      'frontend-proxy-retry-failed-idempotency',
      'trait',
      'img_frontend_proxy_retry_failed_smoke',
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
      'csub_frontend_proxy_retry_smoke',
      'contributor-frontend-proxy-smoke-user',
      'si_frontend_proxy_retry_smoke',
      'img_frontend_proxy_retry_failed_smoke',
      'failed',
      'job_frontend_proxy_retry_failed_smoke',
      ${quote(now)},
      ${quote(now)}
    )
    ON CONFLICT(submission_id) DO UPDATE SET
      owner_user_id = 'contributor-frontend-proxy-smoke-user',
      style_influence_id = 'si_frontend_proxy_retry_smoke',
      source_image_id = 'img_frontend_proxy_retry_failed_smoke',
      status = 'failed',
      last_job_id = 'job_frontend_proxy_retry_failed_smoke',
      updated_at = ${quote(now)};

    INSERT INTO analysis_runs (
      analysis_run_id, job_id, status, attempt_count, started_at, completed_at,
      last_error_code, last_error_message, model_family, model_version
    ) VALUES (
      'run_frontend_proxy_retry_failed_smoke',
      'job_frontend_proxy_retry_failed_smoke',
      'failed',
      1,
      ${quote(older)},
      ${quote(now)},
      'MODEL_TIMEOUT',
      'timeout for smoke seed',
      'standard',
      '6'
    )
    ON CONFLICT(analysis_run_id) DO UPDATE SET
      status = 'failed',
      completed_at = ${quote(now)},
      last_error_code = 'MODEL_TIMEOUT',
      last_error_message = 'timeout for smoke seed';

    INSERT INTO prompts (
      prompt_id, prompt_text, status, version, curated_flag, created_by, created_at
    ) VALUES (
      'prm_frontend_proxy_curation_smoke',
      'frontend proxy prompt curation smoke text',
      'deprecated',
      'v1',
      0,
      'admin-frontend-proxy-smoke-user',
      ${quote(now)}
    )
    ON CONFLICT(prompt_id) DO UPDATE SET
      prompt_text = 'frontend proxy prompt curation smoke text',
      status = 'deprecated',
      version = 'v1';
    `
  );
}

async function waitForUrl(url) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch (_error) {
      // service may not be ready
    }
    await sleep(250);
  }
  throw new Error(`Service did not become ready: ${url}`);
}

async function main() {
  const databaseUrl = requireEnv("DATABASE_URL");
  const dbPath = parseDatabaseUrl(databaseUrl);
  ensureDbParentDir(dbPath);
  ensureMigrationsTable(dbPath);
  assertDatabaseReady(databaseUrl);
  seedData(dbPath);

  const apiPort = await pickAvailablePort(Number(process.env.ADMIN_FRONTEND_PROXY_SMOKE_API_PORT || "3019"));
  const frontendPort = await pickAvailablePort(Number(process.env.ADMIN_FRONTEND_PROXY_SMOKE_FE_PORT || "3003"));
  const adminToken = buildToken("admin-frontend-proxy-smoke-user");
  const contributorToken = buildToken("contributor-frontend-proxy-smoke-user");
  const otherContributorToken = buildToken("contributor-frontend-proxy-other-user");
  const consumerToken = buildToken("consumer-frontend-proxy-smoke-user");

  const apiProc = spawn("node", ["apps/api/src/index.js"], {
    env: { ...process.env, PORT: apiPort },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const feProc = spawn(
    "/bin/zsh",
    ["-lc", `cd apps/frontend && rm -rf .next/cache/webpack && exec ../../node_modules/.bin/next dev -p ${frontendPort}`],
    {
    env: {
      ...process.env,
      FRONTEND_AUTH_MODE: "disabled",
      NEXT_DISABLE_WEBPACK_CACHE: "1",
      NEXT_PUBLIC_API_BASE_URL: `http://127.0.0.1:${apiPort}/v1`,
      NEXT_PUBLIC_APP_BASE_URL: `http://127.0.0.1:${frontendPort}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
    }
  );

  let stderr = "";
  apiProc.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
  feProc.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });

  try {
    await waitForUrl(`http://127.0.0.1:${frontendPort}/`);

    const adminPolicyResponse = await fetch(`http://127.0.0.1:${frontendPort}/api/proxy/admin/approval-policy`, {
      headers: { "x-auth-token": adminToken },
    });
    const adminPolicyJson = await adminPolicyResponse.json();
    if (!adminPolicyResponse.ok) {
      throw new Error(`Frontend proxy admin policy failed (${adminPolicyResponse.status}): ${JSON.stringify(adminPolicyJson)}`);
    }
    assertCondition(adminPolicyJson.policy.approvalMode === "auto-approve", "Expected admin policy approvalMode=auto-approve");

    const forbiddenAdminPolicyResponse = await fetch(`http://127.0.0.1:${frontendPort}/api/proxy/admin/approval-policy`, {
      headers: { "x-auth-token": contributorToken },
    });
    assertCondition(forbiddenAdminPolicyResponse.status === 403, "Expected contributor admin policy access to return 403");

    const forbiddenConsumerCreateResponse = await fetch(`http://127.0.0.1:${frontendPort}/api/proxy/contributor/submissions`, {
      method: "POST",
      headers: {
        "x-auth-token": consumerToken,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        influenceType: "profile",
        influenceCode: `profile-front-proxy-consumer-${Date.now()}`,
        sourceImageId: "img_front_proxy_consumer_forbidden",
      }),
    });
    assertCondition(forbiddenConsumerCreateResponse.status === 403, "Expected consumer contributor-create to return 403");

    const createResponse = await fetch(`http://127.0.0.1:${frontendPort}/api/proxy/contributor/submissions`, {
      method: "POST",
      headers: {
        "x-auth-token": contributorToken,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        influenceType: "profile",
        influenceCode: `profile-front-proxy-create-${Date.now()}`,
        sourceImageId: "img_front_proxy_create",
      }),
    });
    const createJson = await createResponse.json();
    if (!createResponse.ok) {
      throw new Error(`Frontend proxy contributor create failed (${createResponse.status}): ${JSON.stringify(createJson)}`);
    }
    const createdSubmissionId = createJson.submission.submissionId;
    assertCondition(Boolean(createdSubmissionId), "Expected created submission id");

    const listResponse = await fetch(`http://127.0.0.1:${frontendPort}/api/proxy/contributor/submissions`, {
      headers: { "x-auth-token": contributorToken },
    });
    const listJson = await listResponse.json();
    if (!listResponse.ok) {
      throw new Error(`Frontend proxy contributor list failed (${listResponse.status}): ${JSON.stringify(listJson)}`);
    }
    assertCondition(Array.isArray(listJson.submissions), "Expected list submissions array");
    assertCondition(
      listJson.submissions.some((item) => item.submissionId === createdSubmissionId),
      "Expected created submission to appear in list"
    );

    const triggerResponse = await fetch(
      `http://127.0.0.1:${frontendPort}/api/proxy/contributor/submissions/${encodeURIComponent(createdSubmissionId)}/trigger`,
      {
        method: "POST",
        headers: {
          "x-auth-token": contributorToken,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          promptText: "frontend proxy contributor trigger --v 6",
        }),
      }
    );
    const triggerJson = await triggerResponse.json();
    if (!triggerResponse.ok) {
      throw new Error(`Frontend proxy contributor trigger failed (${triggerResponse.status}): ${JSON.stringify(triggerJson)}`);
    }
    assertCondition(["queued", "pending_approval"].includes(triggerJson.submission.status), "Expected trigger queued or pending_approval");

    const foreignReadResponse = await fetch(
      `http://127.0.0.1:${frontendPort}/api/proxy/contributor/submissions/${encodeURIComponent(createdSubmissionId)}`,
      {
        headers: { "x-auth-token": otherContributorToken },
      }
    );
    assertCondition(foreignReadResponse.status === 403, "Expected foreign-owner submission read to return 403");

    const retryRequest = await postJsonWithDbRetry(
      `http://127.0.0.1:${frontendPort}/api/proxy/contributor/submissions/csub_frontend_proxy_retry_smoke/retry`,
      {
        method: "POST",
        headers: {
          "x-auth-token": contributorToken,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          promptText: "frontend proxy contributor retry --v 6",
        }),
      },
      "Frontend proxy contributor retry failed"
    );
    const retryJson = retryRequest.json;
    assertCondition(["queued", "pending_approval"].includes(retryJson.submission.status), "Expected retry queued or pending_approval");

    const adminUsersResponse = await fetch(
      `http://127.0.0.1:${frontendPort}/api/proxy/admin/users?role=consumer&status=active&q=frontend-proxy-smoke&limit=20`,
      {
        headers: { "x-auth-token": adminToken },
      }
    );
    const adminUsersJson = await adminUsersResponse.json();
    if (!adminUsersResponse.ok) {
      throw new Error(`Frontend proxy admin users list failed (${adminUsersResponse.status}): ${JSON.stringify(adminUsersJson)}`);
    }
    assertCondition(Array.isArray(adminUsersJson.users), "Expected admin users list array");
    assertCondition(
      adminUsersJson.users.some((item) => item.userId === "consumer-frontend-proxy-smoke-user"),
      "Expected admin users list to include seeded consumer user"
    );

    const forbiddenAdminUsersResponse = await fetch(
      `http://127.0.0.1:${frontendPort}/api/proxy/admin/users?limit=20`,
      {
        headers: { "x-auth-token": contributorToken },
      }
    );
    assertCondition(forbiddenAdminUsersResponse.status === 403, "Expected contributor admin users list to return 403");

    const roleUpdateResponse = await fetch(
      `http://127.0.0.1:${frontendPort}/api/proxy/admin/users/consumer-frontend-proxy-smoke-user/role`,
      {
        method: "POST",
        headers: {
          "x-auth-token": adminToken,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          role: "contributor",
          status: "active",
          reason: "frontend proxy role smoke update",
        }),
      }
    );
    const roleUpdateJson = await roleUpdateResponse.json();
    if (!roleUpdateResponse.ok) {
      throw new Error(`Frontend proxy role update failed (${roleUpdateResponse.status}): ${JSON.stringify(roleUpdateJson)}`);
    }
    assertCondition(roleUpdateJson.user.role === "contributor", "Expected updated user role=contributor");
    assertCondition(roleUpdateJson.user.status === "active", "Expected updated user status=active");

    const moderationForbiddenResponse = await fetch(
      `http://127.0.0.1:${frontendPort}/api/proxy/admin/analysis-jobs/job_frontend_proxy_retry_failed_smoke/moderation`,
      {
        method: "POST",
        headers: {
          "x-auth-token": contributorToken,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "flag",
          reason: "forbidden moderation check",
        }),
      }
    );
    assertCondition(moderationForbiddenResponse.status === 403, "Expected contributor moderation update to return 403");

    const moderationResponse = await fetch(
      `http://127.0.0.1:${frontendPort}/api/proxy/admin/analysis-jobs/job_frontend_proxy_retry_failed_smoke/moderation`,
      {
        method: "POST",
        headers: {
          "x-auth-token": adminToken,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "flag",
          reason: "frontend proxy moderation smoke",
        }),
      }
    );
    const moderationJson = await moderationResponse.json();
    if (!moderationResponse.ok) {
      throw new Error(`Frontend proxy moderation update failed (${moderationResponse.status}): ${JSON.stringify(moderationJson)}`);
    }
    assertCondition(moderationJson.job.moderationStatus === "flagged", "Expected moderation status=flagged");

    const moderationViewResponse = await fetch(
      `http://127.0.0.1:${frontendPort}/api/proxy/admin/analysis-jobs/job_frontend_proxy_retry_failed_smoke/moderation`,
      {
        headers: {
          "x-auth-token": adminToken,
        },
      }
    );
    const moderationViewJson = await moderationViewResponse.json();
    if (!moderationViewResponse.ok) {
      throw new Error(`Frontend proxy moderation GET failed (${moderationViewResponse.status}): ${JSON.stringify(moderationViewJson)}`);
    }
    assertCondition(Array.isArray(moderationViewJson.actions), "Expected moderation actions array");

    const curationForbiddenResponse = await fetch(
      `http://127.0.0.1:${frontendPort}/api/proxy/admin/prompts/prm_frontend_proxy_curation_smoke/curation`,
      {
        method: "POST",
        headers: {
          "x-auth-token": contributorToken,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          status: "experimental",
          reason: "forbidden curation check",
        }),
      }
    );
    assertCondition(curationForbiddenResponse.status === 403, "Expected contributor prompt curation update to return 403");

    const curationResponse = await fetch(
      `http://127.0.0.1:${frontendPort}/api/proxy/admin/prompts/prm_frontend_proxy_curation_smoke/curation`,
      {
        method: "POST",
        headers: {
          "x-auth-token": adminToken,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          status: "experimental",
          reason: "frontend proxy prompt curation smoke",
        }),
      }
    );
    const curationJson = await curationResponse.json();
    if (!curationResponse.ok) {
      throw new Error(`Frontend proxy prompt curation update failed (${curationResponse.status}): ${JSON.stringify(curationJson)}`);
    }
    assertCondition(curationJson.prompt.status === "experimental", "Expected prompt status=experimental");

    const governanceForbiddenResponse = await fetch(
      `http://127.0.0.1:${frontendPort}/api/proxy/admin/style-influences/si_frontend_proxy_retry_smoke/governance`,
      {
        method: "POST",
        headers: {
          "x-auth-token": contributorToken,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "pin",
          reason: "forbidden governance check",
        }),
      }
    );
    assertCondition(governanceForbiddenResponse.status === 403, "Expected contributor governance update to return 403");

    const governanceResponse = await fetch(
      `http://127.0.0.1:${frontendPort}/api/proxy/admin/style-influences/si_frontend_proxy_retry_smoke/governance`,
      {
        method: "POST",
        headers: {
          "x-auth-token": adminToken,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "pin",
          reason: "frontend proxy governance smoke",
        }),
      }
    );
    const governanceJson = await governanceResponse.json();
    if (!governanceResponse.ok) {
      throw new Error(`Frontend proxy governance update failed (${governanceResponse.status}): ${JSON.stringify(governanceJson)}`);
    }
    assertCondition(governanceJson.styleInfluence.pinned === true, "Expected governance action to pin style influence");

    const governanceAuditResponse = await fetch(
      `http://127.0.0.1:${frontendPort}/api/proxy/admin/style-influences/si_frontend_proxy_retry_smoke/audit`,
      {
        headers: {
          "x-auth-token": adminToken,
        },
      }
    );
    const governanceAuditJson = await governanceAuditResponse.json();
    if (!governanceAuditResponse.ok) {
      throw new Error(`Frontend proxy governance audit failed (${governanceAuditResponse.status}): ${JSON.stringify(governanceAuditJson)}`);
    }
    assertCondition(Array.isArray(governanceAuditJson.actions), "Expected governance actions array");

    console.log(
      JSON.stringify(
        {
          ok: true,
          adminApprovalMode: adminPolicyJson.policy.approvalMode,
          createdSubmissionId,
          listedCount: listJson.submissions.length,
          triggerStatus: triggerJson.submission.status,
          retryStatus: retryJson.submission.status,
          roleManagement: {
            listCount: adminUsersJson.users.length,
            updatedRole: roleUpdateJson.user.role,
            updatedStatus: roleUpdateJson.user.status,
          },
          moderation: {
            status: moderationJson.job.moderationStatus,
            auditCount: moderationViewJson.actions.length,
          },
          promptCuration: {
            status: curationJson.prompt.status,
          },
          governance: {
            pinned: governanceJson.styleInfluence.pinned,
            auditCount: governanceAuditJson.actions.length,
          },
          forbiddenChecks: {
            contributorAdminPolicyStatus: forbiddenAdminPolicyResponse.status,
            contributorAdminUsersStatus: forbiddenAdminUsersResponse.status,
            contributorModerationStatus: moderationForbiddenResponse.status,
            contributorPromptCurationStatus: curationForbiddenResponse.status,
            contributorGovernanceStatus: governanceForbiddenResponse.status,
            consumerContributorCreateStatus: forbiddenConsumerCreateResponse.status,
            foreignOwnerReadStatus: foreignReadResponse.status,
          },
          frontendPort,
          apiPort,
        },
        null,
        2
      )
    );
  } finally {
    feProc.kill("SIGTERM");
    apiProc.kill("SIGTERM");
    await sleep(200);
    if (!feProc.killed) {
      feProc.kill("SIGKILL");
    }
    if (!apiProc.killed) {
      apiProc.kill("SIGKILL");
    }
    if (stderr.trim() !== "") {
      process.stderr.write(stderr);
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
