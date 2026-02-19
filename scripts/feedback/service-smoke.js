const { spawn } = require("child_process");
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

function buildLocalToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlJson({ alg: "none", typ: "JWT" });
  const payload = base64UrlJson({
    iss: process.env.COGNITO_ISSUER,
    aud: process.env.COGNITO_AUDIENCE,
    sub: "feedback-smoke-user",
    exp: now + 3600,
  });
  return `${header}.${payload}.sig`;
}

function buildTokenForUser(sub) {
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

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function requireEnv(key) {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value.trim();
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

function seedRecommendationSession(dbPath) {
  const now = new Date().toISOString();
  const suffix = Date.now();
  const extractionId = `rex_feedback_service_${suffix}`;
  const promptId = `prm_feedback_service_${suffix}`;
  const sessionId = `rs_feedback_service_${suffix}`;
  const recommendationId = `rec_feedback_service_${suffix}`;

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
      'editorial portrait in soft rain --v 6',
      'feedback-smoke-user',
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
      'editorial portrait in soft rain --v 6',
      'active',
      'v1',
      0,
      'feedback-smoke-user',
      ${quote(now)}
    );

    INSERT INTO recommendation_sessions (
      session_id, user_id, mode, extraction_id, prompt_id, status, created_at, updated_at
    ) VALUES (
      ${quote(sessionId)},
      'feedback-smoke-user',
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
      'Feedback smoke recommendation',
      0.74,
      '[]',
      '["Keep composition constraints stable."]',
      ${quote(now)}
    );
    `
  );

  return {
    sessionId,
    recommendationId,
  };
}

async function waitForHealth(baseUrl, token) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        return;
      }
    } catch (_error) {
      // API may not be ready yet.
    }
    await sleep(250);
  }
  throw new Error("API healthcheck did not become ready in time");
}

async function main() {
  const databaseUrl = requireEnv("DATABASE_URL");
  const dbPath = parseDatabaseUrl(databaseUrl);
  ensureDbParentDir(dbPath);
  ensureMigrationsTable(dbPath);
  assertDatabaseReady(databaseUrl);

  const originalPort = requireEnv("PORT");
  const smokePort = process.env.FEEDBACK_SMOKE_API_PORT || "3012";
  const token = buildLocalToken();
  const otherUserToken = buildTokenForUser("feedback-smoke-other-user");
  const baseUrl = `http://127.0.0.1:${smokePort}/v1`;

  const seeded = seedRecommendationSession(dbPath);

  const apiProc = spawn("node", ["apps/api/src/index.js"], {
    env: {
      ...process.env,
      PORT: smokePort,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  apiProc.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });

  try {
    await waitForHealth(baseUrl, token);

    const uploadResponse = await fetch(`${baseUrl}/generated-images`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        recommendationSessionId: seeded.sessionId,
        fileName: "feedback-smoke.png",
        mimeType: "image/png",
        fileBase64: tinyPngBase64(),
      }),
    });
    const uploadJson = await uploadResponse.json();
    if (!uploadResponse.ok) {
      throw new Error(`Generated-image upload failed (${uploadResponse.status}): ${JSON.stringify(uploadJson)}`);
    }
    const generatedImageId = uploadJson?.generatedImage?.generatedImageId;
    assertCondition(Boolean(generatedImageId), "Upload response missing generatedImageId");

    const normalFeedbackResponse = await fetch(`${baseUrl}/post-result-feedback`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        recommendationSessionId: seeded.sessionId,
        recommendationId: seeded.recommendationId,
        generatedImageId,
        emojiRating: "🙂",
        usefulFlag: true,
        comments: "High alignment with expected tone.",
      }),
    });
    const normalFeedbackJson = await normalFeedbackResponse.json();
    if (!normalFeedbackResponse.ok) {
      throw new Error(`Normal-impact feedback failed (${normalFeedbackResponse.status}): ${JSON.stringify(normalFeedbackJson)}`);
    }
    assertCondition(
      normalFeedbackJson?.feedback?.evidenceStrength === "normal",
      "Expected normal evidence strength for image+emoji feedback"
    );
    assertCondition(
      normalFeedbackJson?.alignment?.confidenceDelta > 0.05,
      "Expected positive confidence delta for positive normal-impact feedback"
    );
    const normalFeedbackId = normalFeedbackJson?.feedback?.feedbackId;
    assertCondition(Boolean(normalFeedbackId), "Expected feedbackId in normal-impact response");

    const minorFeedbackResponse = await fetch(`${baseUrl}/post-result-feedback`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        recommendationSessionId: seeded.sessionId,
        recommendationId: seeded.recommendationId,
        emojiRating: "☹️",
      }),
    });
    const minorFeedbackJson = await minorFeedbackResponse.json();
    if (!minorFeedbackResponse.ok) {
      throw new Error(`Minor-impact feedback failed (${minorFeedbackResponse.status}): ${JSON.stringify(minorFeedbackJson)}`);
    }
    assertCondition(
      minorFeedbackJson?.feedback?.evidenceStrength === "minor",
      "Expected minor evidence strength for emoji-only feedback"
    );
    const delta = minorFeedbackJson?.alignment?.confidenceDelta;
    assertCondition(
      typeof delta === "number" && delta <= -0.02 && delta >= -0.03,
      "Expected bounded minor confidence delta for emoji-only feedback"
    );

    const getFeedbackResponse = await fetch(`${baseUrl}/post-result-feedback/${normalFeedbackId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const getFeedbackJson = await getFeedbackResponse.json();
    if (!getFeedbackResponse.ok) {
      throw new Error(`Feedback retrieval failed (${getFeedbackResponse.status}): ${JSON.stringify(getFeedbackJson)}`);
    }
    assertCondition(
      getFeedbackJson?.feedback?.feedbackId === normalFeedbackId,
      "Feedback retrieval returned unexpected feedbackId"
    );

    const listFeedbackResponse = await fetch(`${baseUrl}/recommendation-sessions/${seeded.sessionId}/post-result-feedback`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const listFeedbackJson = await listFeedbackResponse.json();
    if (!listFeedbackResponse.ok) {
      throw new Error(`Session feedback list retrieval failed (${listFeedbackResponse.status}): ${JSON.stringify(listFeedbackJson)}`);
    }
    assertCondition(
      Array.isArray(listFeedbackJson?.feedback) && listFeedbackJson.feedback.length >= 2,
      "Expected at least two feedback records in session feedback list"
    );

    const forbiddenResponse = await fetch(`${baseUrl}/post-result-feedback/${normalFeedbackId}`, {
      headers: {
        Authorization: `Bearer ${otherUserToken}`,
      },
    });
    assertCondition(forbiddenResponse.status === 403, "Expected 403 for foreign-user feedback retrieval");

    console.log(
      JSON.stringify(
        {
          ok: true,
          sessionId: seeded.sessionId,
          recommendationId: seeded.recommendationId,
          generatedImageId,
          normalImpact: {
            feedbackId: normalFeedbackJson.feedback.feedbackId,
            evidenceStrength: normalFeedbackJson.feedback.evidenceStrength,
            alignmentScore: normalFeedbackJson.alignment.alignmentScore,
            confidenceDelta: normalFeedbackJson.alignment.confidenceDelta,
          },
          minorImpact: {
            feedbackId: minorFeedbackJson.feedback.feedbackId,
            evidenceStrength: minorFeedbackJson.feedback.evidenceStrength,
            alignmentScore: minorFeedbackJson.alignment.alignmentScore,
            confidenceDelta: minorFeedbackJson.alignment.confidenceDelta,
          },
          retrieval: {
            fetchedFeedbackId: getFeedbackJson.feedback.feedbackId,
            listedFeedbackCount: listFeedbackJson.feedback.length,
            forbiddenStatus: forbiddenResponse.status,
          },
          port: smokePort,
          previousPort: originalPort,
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
    if (stderr.trim() !== "") {
      process.stderr.write(stderr);
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
