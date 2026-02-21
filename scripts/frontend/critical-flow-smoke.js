const { spawn } = require("child_process");
const net = require("net");
const { parseDatabaseUrl, ensureDbParentDir, ensureMigrationsTable, runSql } = require("../db/lib");
const { assertDatabaseReady } = require("../db/runtime");

function requireEnv(key) {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value.trim();
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
  requireEnv("COGNITO_ISSUER");
  requireEnv("COGNITO_AUDIENCE");
  const dbPath = parseDatabaseUrl(databaseUrl);
  ensureDbParentDir(dbPath);
  ensureMigrationsTable(dbPath);
  assertDatabaseReady(databaseUrl);
  const now = new Date().toISOString();
  runSql(
    dbPath,
    `
    INSERT INTO users (user_id, role, status, created_at, updated_at)
    VALUES ('admin-frontend-critical-smoke-user', 'admin', 'active', ${quote(now)}, ${quote(now)})
    ON CONFLICT(user_id) DO UPDATE SET role = 'admin', status = 'active', updated_at = ${quote(now)};
    `
  );
  const adminToken = buildToken("admin-frontend-critical-smoke-user");

  const apiPort = await pickAvailablePort(Number(process.env.FRONTEND_CRITICAL_SMOKE_API_PORT || "3026"));
  const frontendPort = await pickAvailablePort(Number(process.env.FRONTEND_CRITICAL_SMOKE_FE_PORT || "3006"));
  const frontendBase = `http://127.0.0.1:${frontendPort}`;

  const apiProc = spawn("node", ["apps/api/src/index.js"], {
    env: { ...process.env, PORT: apiPort },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const frontendProc = spawn(
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
  frontendProc.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });

  try {
    await waitForUrl(`${frontendBase}/`);

    const htmlResponse = await fetch(`${frontendBase}/`);
    const html = await htmlResponse.text();
    if (!htmlResponse.ok) {
      throw new Error(`Frontend page failed (${htmlResponse.status})`);
    }
    if (!html.includes("UI Upgrade - U3 Recommendation Flow")) {
      throw new Error("Frontend page missing recommendation flow heading");
    }
    if (!html.includes("Create Extraction")) {
      throw new Error("Frontend page missing extraction action");
    }

    const policyResponse = await fetch(`${frontendBase}/api/proxy/admin/approval-policy`, {
      headers: {
        "x-auth-token": adminToken,
      },
    });
    const policyJson = await policyResponse.json();
    if (!policyResponse.ok) {
      throw new Error(`Frontend API proxy policy failed (${policyResponse.status}): ${JSON.stringify(policyJson)}`);
    }
    if (!policyJson.policy || !policyJson.policy.approvalMode) {
      throw new Error(`Unexpected policy payload: ${JSON.stringify(policyJson)}`);
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          frontendPort,
          apiPort,
          headingFound: true,
          extractionActionFound: true,
          proxiedPolicyMode: policyJson.policy.approvalMode,
        },
        null,
        2
      )
    );
  } finally {
    apiProc.kill("SIGTERM");
    frontendProc.kill("SIGTERM");
    await sleep(200);
    if (!apiProc.killed) {
      apiProc.kill("SIGKILL");
    }
    if (!frontendProc.killed) {
      frontendProc.kill("SIGKILL");
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
