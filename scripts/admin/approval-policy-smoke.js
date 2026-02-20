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
    VALUES ('admin-approval-smoke-user', 'admin', 'active', ${quote(now)}, ${quote(now)})
    ON CONFLICT(user_id) DO UPDATE SET role = 'admin', status = 'active', updated_at = ${quote(now)};

    INSERT INTO users (user_id, role, status, created_at, updated_at)
    VALUES ('consumer-approval-smoke-user', 'consumer', 'active', ${quote(now)}, ${quote(now)})
    ON CONFLICT(user_id) DO UPDATE SET role = 'consumer', status = 'active', updated_at = ${quote(now)};
    `
  );
}

async function postApprovalPolicy(baseUrl, token, approvalMode, reason) {
  const response = await fetch(`${baseUrl}/admin/approval-policy`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      approvalMode,
      reason,
    }),
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(`Policy update failed (${response.status}): ${JSON.stringify(json)}`);
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

  const adminToken = buildToken("admin-approval-smoke-user");
  const consumerToken = buildToken("consumer-approval-smoke-user");
  const smokePort = process.env.SMOKE_API_PORT || "3017";
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

    const initialPolicyResponse = await fetch(`${baseUrl}/admin/approval-policy`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });
    const initialPolicyJson = await initialPolicyResponse.json();
    assertCondition(initialPolicyResponse.ok, "Expected approval policy GET to succeed");
    assertCondition(initialPolicyJson.policy.approvalMode === "auto-approve", "Expected default approval mode=auto-approve");

    const forbiddenPolicyResponse = await fetch(`${baseUrl}/admin/approval-policy`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${consumerToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        approvalMode: "manual",
        reason: "forbidden-check",
      }),
    });
    assertCondition(forbiddenPolicyResponse.status === 403, "Expected non-admin policy update to return 403");

    const manualPolicy = await postApprovalPolicy(
      baseUrl,
      adminToken,
      "manual",
      "approval policy smoke manual enable"
    );
    assertCondition(manualPolicy.policy.approvalMode === "manual", "Expected policy mode=manual");

    const manualJobResponse = await fetch(`${baseUrl}/analysis-jobs`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${consumerToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        idempotencyKey: `approval-smoke-manual-${Date.now()}`,
        runType: "trait",
        imageId: "img-approval-smoke-manual",
      }),
    });
    const manualJobJson = await manualJobResponse.json();
    if (!manualJobResponse.ok) {
      throw new Error(`Manual-mode job submit failed (${manualJobResponse.status}): ${JSON.stringify(manualJobJson)}`);
    }
    assertCondition(manualJobJson.job.status === "pending_approval", "Expected manual mode job status=pending_approval");
    assertCondition(manualJobJson.approvalPolicy.approvalMode === "manual", "Expected manual mode policy snapshot");

    const approvalResponse = await fetch(
      `${baseUrl}/admin/analysis-jobs/${manualJobJson.job.jobId}/approval`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "approve",
          reason: "approval policy smoke admin approve",
        }),
      }
    );
    const approvalJson = await approvalResponse.json();
    if (!approvalResponse.ok) {
      throw new Error(`Job approval failed (${approvalResponse.status}): ${JSON.stringify(approvalJson)}`);
    }
    assertCondition(approvalJson.job.status === "queued", "Expected approved manual job status=queued");

    const approvalViewResponse = await fetch(
      `${baseUrl}/admin/analysis-jobs/${manualJobJson.job.jobId}/approval`,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      }
    );
    const approvalViewJson = await approvalViewResponse.json();
    assertCondition(approvalViewResponse.ok, "Expected approval view endpoint to succeed");
    assertCondition(Array.isArray(approvalViewJson.actions) && approvalViewJson.actions.length >= 1, "Expected approval action audit");

    const autoPolicy = await postApprovalPolicy(
      baseUrl,
      adminToken,
      "auto-approve",
      "approval policy smoke auto enable"
    );
    assertCondition(autoPolicy.policy.approvalMode === "auto-approve", "Expected policy mode=auto-approve");

    const autoJobResponse = await fetch(`${baseUrl}/analysis-jobs`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${consumerToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        idempotencyKey: `approval-smoke-auto-${Date.now()}`,
        runType: "trait",
        imageId: "img-approval-smoke-auto",
      }),
    });
    const autoJobJson = await autoJobResponse.json();
    if (!autoJobResponse.ok) {
      throw new Error(`Auto-mode job submit failed (${autoJobResponse.status}): ${JSON.stringify(autoJobJson)}`);
    }
    assertCondition(autoJobJson.job.status === "queued", "Expected auto-approve job status=queued");
    assertCondition(autoJobJson.approvalPolicy.approvalMode === "auto-approve", "Expected auto mode policy snapshot");

    const finalPolicyResponse = await fetch(`${baseUrl}/admin/approval-policy`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });
    const finalPolicyJson = await finalPolicyResponse.json();
    assertCondition(finalPolicyResponse.ok, "Expected final policy GET to succeed");
    assertCondition(finalPolicyJson.policy.approvalMode === "auto-approve", "Expected final approval mode=auto-approve");
    assertCondition(Array.isArray(finalPolicyJson.actions) && finalPolicyJson.actions.length >= 2, "Expected policy audit entries");

    console.log(
      JSON.stringify(
        {
          ok: true,
          initialApprovalMode: initialPolicyJson.policy.approvalMode,
          forbiddenStatus: forbiddenPolicyResponse.status,
          manualModeJobStatus: manualJobJson.job.status,
          approvedManualJobStatus: approvalJson.job.status,
          autoModeJobStatus: autoJobJson.job.status,
          finalApprovalMode: finalPolicyJson.policy.approvalMode,
          policyAuditCount: finalPolicyJson.actions.length,
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
