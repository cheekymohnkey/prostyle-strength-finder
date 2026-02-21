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

function tinyPngBase64() {
  const bytes = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9c, 0x63, 0x60, 0x00, 0x00, 0x00,
    0x02, 0x00, 0x01, 0xe5, 0x27, 0xd4, 0xa2, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82,
  ]);
  return bytes.toString("base64");
}

function seedRecommendationSession(dbPath, userId) {
  const now = new Date().toISOString();
  const suffix = Date.now();
  const extractionId = `rex_feedback_proxy_${suffix}`;
  const promptId = `prm_feedback_proxy_${suffix}`;
  const sessionId = `rs_feedback_proxy_${suffix}`;
  const recommendationId = `rec_feedback_proxy_${suffix}`;

  runSql(
    dbPath,
    `
    INSERT INTO recommendation_extractions (
      extraction_id, status, prompt_text, author, creation_time, source_job_id,
      model_family, model_version, model_selection_source,
      is_baseline, has_profile, has_sref, parser_version, metadata_raw_json, created_at, confirmed_at
    ) VALUES (
      ${quote(extractionId)},
      'confirmed',
      'studio portrait in rain --v 6',
      ${quote(userId)},
      ${quote(now)},
      NULL,
      'standard',
      '6',
      'prompt_flag',
      1,
      0,
      0,
      'midjourney-metadata-v1',
      '[]',
      ${quote(now)},
      ${quote(now)}
    );

    INSERT INTO prompts (
      prompt_id, prompt_text, status, version, curated_flag, created_by, created_at
    ) VALUES (
      ${quote(promptId)},
      'studio portrait in rain --v 6',
      'active',
      'v1',
      0,
      ${quote(userId)},
      ${quote(now)}
    );

    INSERT INTO recommendation_sessions (
      session_id, user_id, mode, extraction_id, prompt_id, status, created_at, updated_at
    ) VALUES (
      ${quote(sessionId)},
      ${quote(userId)},
      'precision',
      ${quote(extractionId)},
      ${quote(promptId)},
      'succeeded',
      ${quote(now)},
      ${quote(now)}
    );

    INSERT INTO recommendations (
      recommendation_id, recommendation_session_id, rank, combination_id, rationale,
      confidence, risk_notes_json, prompt_improvements_json, created_at
    ) VALUES (
      ${quote(recommendationId)},
      ${quote(sessionId)},
      1,
      'combo_studio_portrait',
      'Frontend proxy smoke recommendation',
      0.72,
      '[]',
      '["Keep subject isolation strong."]',
      ${quote(now)}
    );
    `
  );

  return { sessionId, recommendationId };
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

  const apiPort = await pickAvailablePort(Number(process.env.FRONTEND_PROXY_SMOKE_API_PORT || "3013"));
  const frontendPort = await pickAvailablePort(Number(process.env.FRONTEND_PROXY_SMOKE_FE_PORT || "3002"));
  const userId = "feedback-proxy-user";
  const token = buildToken(userId);

  const seeded = seedRecommendationSession(dbPath, userId);

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

    const uploadResponse = await fetch(`http://127.0.0.1:${frontendPort}/api/proxy/generated-images`, {
      method: "POST",
      headers: {
        "x-auth-token": token,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        recommendationSessionId: seeded.sessionId,
        fileName: "proxy-smoke.png",
        mimeType: "image/png",
        fileBase64: tinyPngBase64(),
      }),
    });
    const uploadJson = await uploadResponse.json();
    if (!uploadResponse.ok) {
      throw new Error(`Frontend proxy upload failed (${uploadResponse.status}): ${JSON.stringify(uploadJson)}`);
    }
    const generatedImageId = uploadJson?.generatedImage?.generatedImageId;
    assertCondition(Boolean(generatedImageId), "Proxy upload missing generatedImageId");

    const feedbackResponse = await fetch(`http://127.0.0.1:${frontendPort}/api/proxy/post-result-feedback`, {
      method: "POST",
      headers: {
        "x-auth-token": token,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        recommendationSessionId: seeded.sessionId,
        recommendationId: seeded.recommendationId,
        generatedImageId,
        emojiRating: "🙂",
        usefulFlag: true,
        comments: "proxy smoke",
      }),
    });
    const feedbackJson = await feedbackResponse.json();
    if (!feedbackResponse.ok) {
      throw new Error(`Frontend proxy feedback submit failed (${feedbackResponse.status}): ${JSON.stringify(feedbackJson)}`);
    }
    const feedbackId = feedbackJson?.feedback?.feedbackId;
    assertCondition(Boolean(feedbackId), "Proxy feedback response missing feedbackId");

    const getFeedbackResponse = await fetch(
      `http://127.0.0.1:${frontendPort}/api/proxy/post-result-feedback/${feedbackId}`,
      { headers: { "x-auth-token": token } }
    );
    const getFeedbackJson = await getFeedbackResponse.json();
    if (!getFeedbackResponse.ok) {
      throw new Error(`Frontend proxy feedback retrieval failed (${getFeedbackResponse.status}): ${JSON.stringify(getFeedbackJson)}`);
    }

    const listResponse = await fetch(
      `http://127.0.0.1:${frontendPort}/api/proxy/recommendation-sessions/${seeded.sessionId}/post-result-feedback`,
      { headers: { "x-auth-token": token } }
    );
    const listJson = await listResponse.json();
    if (!listResponse.ok) {
      throw new Error(`Frontend proxy feedback list failed (${listResponse.status}): ${JSON.stringify(listJson)}`);
    }
    assertCondition(Array.isArray(listJson.feedback) && listJson.feedback.length >= 1, "Expected session feedback list entries");

    console.log(
      JSON.stringify(
        {
          ok: true,
          sessionId: seeded.sessionId,
          recommendationId: seeded.recommendationId,
          generatedImageId,
          feedbackId,
          listedFeedbackCount: listJson.feedback.length,
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
