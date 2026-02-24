const { spawn } = require("child_process");
const {
  parseDatabaseUrl,
  ensureDbParentDir,
  ensureMigrationsTable,
  runSql,
} = require("../db/lib");
const {
  insertStyleDnaCanonicalTrait,
  listStyleDnaTraitDiscoveries,
} = require("../db/repository");
const { assertDatabaseReady } = require("../db/runtime");
const {
  canonicalizeStyleDnaTraits,
  normalizeTraitText,
} = require("../inference/style-dna-canonicalizer");

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

function seedAdmin(dbPath) {
  const now = new Date().toISOString();
  runSql(
    dbPath,
    `
    INSERT INTO users (user_id, role, status, created_at, updated_at)
    VALUES ('admin-style-dna-discovery-review-smoke-user', 'admin', 'active', ${quote(now)}, ${quote(now)})
    ON CONFLICT(user_id) DO UPDATE SET role = 'admin', status = 'active', updated_at = ${quote(now)};
    `
  );
}

function getPendingDiscoveryByNormalized(dbPath, normalizedTrait) {
  const rows = listStyleDnaTraitDiscoveries(dbPath, {
    status: "pending_review",
    taxonomyVersion: "style_dna_v1",
    axis: "lighting_and_contrast",
    limit: 200,
  });
  return rows.find((row) => String(row.normalized_trait || "") === normalizedTrait) || null;
}

async function main() {
  const databaseUrl = requireEnv("DATABASE_URL");
  requireEnv("COGNITO_ISSUER");
  requireEnv("COGNITO_AUDIENCE");
  const dbPath = parseDatabaseUrl(databaseUrl);
  ensureDbParentDir(dbPath);
  ensureMigrationsTable(dbPath);
  assertDatabaseReady(databaseUrl);
  seedAdmin(dbPath);

  const canonicalTraitId = `canon_review_smoke_${Date.now()}`;
  insertStyleDnaCanonicalTrait(dbPath, {
    canonicalTraitId,
    taxonomyVersion: "style_dna_v1",
    axis: "lighting_and_contrast",
    displayLabel: "rim lighting in haze",
    normalizedLabel: normalizeTraitText("rim lighting in haze"),
    createdBy: "smoke",
    notes: "discovery review replay smoke canonical seed",
  });

  const reviewAliasTraitRaw = "rim halo haze var";
  const reviewAliasTraitNormalized = normalizeTraitText(reviewAliasTraitRaw);
  const createCanonicalTraitRaw = "chrome bloom fringe var";
  const createCanonicalTraitNormalized = normalizeTraitText(createCanonicalTraitRaw);

  // Force unresolved creation (no auto-merge) so review endpoint has pending discoveries to process.
  await canonicalizeStyleDnaTraits({
    dbPath,
    taxonomyVersion: "style_dna_v1",
    lexicalThreshold: 1,
    semanticThreshold: 1,
    semantic: { mode: "proxy" },
    styleDnaRunId: `sdna_review_smoke_${Date.now()}`,
    analysisRunId: `analysis_review_smoke_${Date.now()}`,
    atomicTraits: {
      lighting_and_contrast: [reviewAliasTraitRaw, createCanonicalTraitRaw],
    },
  });

  const firstPending = getPendingDiscoveryByNormalized(dbPath, reviewAliasTraitNormalized);
  const secondPending = getPendingDiscoveryByNormalized(dbPath, createCanonicalTraitNormalized);
  assertCondition(Boolean(firstPending?.discovery_id), "Expected pending discovery for alias approval case");
  assertCondition(Boolean(secondPending?.discovery_id), "Expected pending discovery for create canonical case");

  const adminToken = buildToken("admin-style-dna-discovery-review-smoke-user");
  const smokePort = process.env.SMOKE_API_PORT || "3027";
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

    const approveAliasResponse = await fetch(
      `${baseUrl}/admin/style-dna/trait-discoveries/${encodeURIComponent(firstPending.discovery_id)}/review`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "approve_alias",
          canonicalTraitId,
          note: "Discovery review replay smoke approve alias.",
        }),
      }
    );
    const approveAliasJson = await approveAliasResponse.json();
    if (!approveAliasResponse.ok) {
      throw new Error(`Alias approval review failed (${approveAliasResponse.status}): ${JSON.stringify(approveAliasJson)}`);
    }
    assertCondition(
      String(approveAliasJson?.discovery?.status || "") === "approved_alias",
      "Expected approved_alias review status"
    );

    const duplicateReviewResponse = await fetch(
      `${baseUrl}/admin/style-dna/trait-discoveries/${encodeURIComponent(firstPending.discovery_id)}/review`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "approve_alias",
          canonicalTraitId,
          note: "Duplicate review should fail.",
        }),
      }
    );
    const duplicateReviewJson = await duplicateReviewResponse.json();
    assertCondition(duplicateReviewResponse.status === 409, "Expected duplicate review to return 409");
    assertCondition(
      String(duplicateReviewJson?.error?.code || duplicateReviewJson?.code || "") === "INVALID_STATE",
      `Expected duplicate review INVALID_STATE, got ${JSON.stringify(duplicateReviewJson)}`
    );

    const createCanonicalDisplayLabel = `chrome bloom fringe canonical ${Date.now()}`;
    const createCanonicalResponse = await fetch(
      `${baseUrl}/admin/style-dna/trait-discoveries/${encodeURIComponent(secondPending.discovery_id)}/review`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "create_canonical",
          canonicalDisplayLabel: createCanonicalDisplayLabel,
          note: "Discovery review replay smoke create canonical.",
        }),
      }
    );
    const createCanonicalJson = await createCanonicalResponse.json();
    if (!createCanonicalResponse.ok) {
      throw new Error(`Create canonical review failed (${createCanonicalResponse.status}): ${JSON.stringify(createCanonicalJson)}`);
    }
    assertCondition(
      String(createCanonicalJson?.discovery?.status || "") === "approved_new_canonical",
      "Expected approved_new_canonical review status"
    );
    const createdCanonicalTraitId = String(
      createCanonicalJson?.discovery?.resolutionPayload?.canonicalTraitId || ""
    ).trim();
    assertCondition(Boolean(createdCanonicalTraitId), "Expected canonicalTraitId in create_canonical review resolution");

    const replayResult = await canonicalizeStyleDnaTraits({
      dbPath,
      taxonomyVersion: "style_dna_v1",
      styleDnaRunId: `sdna_review_replay_${Date.now()}`,
      analysisRunId: `analysis_review_replay_${Date.now()}`,
      atomicTraits: {
        lighting_and_contrast: [reviewAliasTraitRaw, createCanonicalTraitRaw],
      },
    });

    assertCondition(
      replayResult.canonicalizationStats.unresolved === 0,
      `Expected replay canonicalization unresolved=0, got ${replayResult.canonicalizationStats.unresolved}`
    );
    assertCondition(
      replayResult.canonicalizationStats.aliasMatches >= 2,
      `Expected replay canonicalization aliasMatches>=2, got ${replayResult.canonicalizationStats.aliasMatches}`
    );

    const pendingAfterReplay = listStyleDnaTraitDiscoveries(dbPath, {
      status: "pending_review",
      taxonomyVersion: "style_dna_v1",
      axis: "lighting_and_contrast",
      limit: 200,
    }).filter((row) => (
      [reviewAliasTraitNormalized, createCanonicalTraitNormalized].includes(String(row.normalized_trait || ""))
    ));
    assertCondition(
      pendingAfterReplay.length === 0,
      `Expected no pending replay discoveries after review actions, got ${pendingAfterReplay.length}`
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          smokePort,
          reviewed: {
            approvedAliasDiscoveryId: firstPending.discovery_id,
            createCanonicalDiscoveryId: secondPending.discovery_id,
            createdCanonicalTraitId,
            duplicateReviewStatus: duplicateReviewResponse.status,
          },
          replay: {
            aliasMatches: replayResult.canonicalizationStats.aliasMatches,
            unresolved: replayResult.canonicalizationStats.unresolved,
            canonicalizedLightingTraits: replayResult.canonicalizedTraits.lighting_and_contrast || [],
          },
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
