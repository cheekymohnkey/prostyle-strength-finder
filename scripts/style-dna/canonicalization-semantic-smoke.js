const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const {
  ensureDbParentDir,
  ensureMigrationsTable,
  listMigrationFiles,
  applyMigration,
  runSql,
} = require("../db/lib");
const {
  insertStyleDnaCanonicalTrait,
  listActiveStyleDnaTraitAliases,
} = require("../db/repository");
const {
  canonicalizeStyleDnaTraits,
  normalizeTraitText,
} = require("../inference/style-dna-canonicalizer");

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createTempDbPath() {
  return path.join(os.tmpdir(), `style-dna-canonicalization-semantic-smoke-${Date.now()}-${crypto.randomUUID()}.sqlite3`);
}

function applyAllMigrations(dbPath) {
  ensureDbParentDir(dbPath);
  ensureMigrationsTable(dbPath);
  const migrationFiles = listMigrationFiles();
  migrationFiles.forEach((name) => {
    applyMigration(dbPath, name);
  });
}

function seedCanonicalTraits(dbPath) {
  insertStyleDnaCanonicalTrait(dbPath, {
    canonicalTraitId: "canon_semantic_target",
    taxonomyVersion: "style_dna_v1",
    axis: "lighting_and_contrast",
    displayLabel: "ghostline halation fringe",
    normalizedLabel: normalizeTraitText("ghostline halation fringe"),
    createdBy: "smoke",
  });
  insertStyleDnaCanonicalTrait(dbPath, {
    canonicalTraitId: "canon_semantic_distractor",
    taxonomyVersion: "style_dna_v1",
    axis: "lighting_and_contrast",
    displayLabel: "muddied shadow fog",
    normalizedLabel: normalizeTraitText("muddied shadow fog"),
    createdBy: "smoke",
  });
}

function countPendingDiscoveries(dbPath) {
  const rows = JSON.parse(
    runSql(
      dbPath,
      "SELECT COUNT(1) AS count FROM style_dna_trait_discoveries WHERE status = 'pending_review';",
      { json: true }
    ) || "[]"
  );
  return Number(rows[0]?.count || 0);
}

function withMockedFetch(handler, fn) {
  const originalFetch = global.fetch;
  global.fetch = handler;
  return Promise.resolve()
    .then(() => fn())
    .finally(() => {
      global.fetch = originalFetch;
    });
}

function createEmbeddingSuccessFetch() {
  return async (_url, options) => {
    const body = JSON.parse(String(options?.body || "{}"));
    const inputs = Array.isArray(body.input) ? body.input : [];
    const vectors = inputs.map((text) => {
      const key = String(text || "").trim();
      if (key === "ghostline halo fringe") {
        return [1, 0];
      }
      if (key === "ghostline halation fringe") {
        return [1, 0];
      }
      if (key === "muddied shadow fog") {
        return [0, 1];
      }
      return [0.5, 0.5];
    });

    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          data: vectors.map((embedding) => ({ embedding })),
        });
      },
    };
  };
}

function createEmbeddingFailureFetch() {
  return async () => {
    throw new Error("synthetic embedding outage");
  };
}

async function runCase({
  semanticMode,
  fetchHandler = null,
}) {
  const dbPath = createTempDbPath();
  try {
    applyAllMigrations(dbPath);
    seedCanonicalTraits(dbPath);

    const execute = async () => canonicalizeStyleDnaTraits({
      dbPath,
      taxonomyVersion: "style_dna_v1",
      lexicalThreshold: 0,
      semanticThreshold: 0.95,
      styleDnaRunId: `sdna_run_${semanticMode}`,
      analysisRunId: `analysis_run_${semanticMode}`,
      semantic: {
        mode: semanticMode,
        openAi: {
          apiKey: "smoke-test-key",
          baseUrl: "http://127.0.0.1:9",
          embeddingModel: "text-embedding-3-small",
        },
      },
      atomicTraits: {
        lighting_and_contrast: ["ghostline halo fringe"],
      },
    });

    const result = fetchHandler
      ? await withMockedFetch(fetchHandler, execute)
      : await execute();

    const aliases = listActiveStyleDnaTraitAliases(dbPath, {
      taxonomyVersion: "style_dna_v1",
      axis: "lighting_and_contrast",
    });
    const pendingDiscoveries = countPendingDiscoveries(dbPath);

    return {
      result,
      aliases,
      pendingDiscoveries,
    };
  } finally {
    if (fs.existsSync(dbPath)) {
      fs.rmSync(dbPath, { force: true });
    }
  }
}

async function main() {
  const proxy = await runCase({
    semanticMode: "proxy",
  });
  assertCondition(
    proxy.result.canonicalizationStats.autoMerged === 0,
    `Expected proxy mode to avoid auto-merge, got ${proxy.result.canonicalizationStats.autoMerged}`
  );
  assertCondition(
    proxy.pendingDiscoveries >= 1,
    `Expected proxy mode to create pending discovery, got ${proxy.pendingDiscoveries}`
  );

  const embedding = await runCase({
    semanticMode: "embedding",
    fetchHandler: createEmbeddingSuccessFetch(),
  });
  assertCondition(
    embedding.result.canonicalizationStats.autoMerged === 1,
    `Expected embedding mode to auto-merge, got ${embedding.result.canonicalizationStats.autoMerged}`
  );
  assertCondition(
    embedding.result.unresolvedDiscoveries.length === 0,
    `Expected embedding mode unresolved discoveries to be empty, got ${embedding.result.unresolvedDiscoveries.length}`
  );
  assertCondition(
    embedding.aliases.some((row) => row.normalized_alias === normalizeTraitText("ghostline halo fringe")),
    "Expected embedding mode to persist alias for ghostline halo fringe"
  );

  const autoFallback = await runCase({
    semanticMode: "auto",
    fetchHandler: createEmbeddingFailureFetch(),
  });
  assertCondition(
    autoFallback.result.canonicalizationStats.autoMerged === 0,
    `Expected auto mode fallback to proxy (no auto-merge), got ${autoFallback.result.canonicalizationStats.autoMerged}`
  );
  assertCondition(
    autoFallback.pendingDiscoveries >= 1,
    `Expected auto fallback to create pending discovery, got ${autoFallback.pendingDiscoveries}`
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        cases: {
          proxy: {
            autoMerged: proxy.result.canonicalizationStats.autoMerged,
            unresolved: proxy.result.canonicalizationStats.unresolved,
            pendingDiscoveries: proxy.pendingDiscoveries,
          },
          embedding: {
            autoMerged: embedding.result.canonicalizationStats.autoMerged,
            unresolved: embedding.result.canonicalizationStats.unresolved,
            pendingDiscoveries: embedding.pendingDiscoveries,
          },
          autoFallback: {
            autoMerged: autoFallback.result.canonicalizationStats.autoMerged,
            unresolved: autoFallback.result.canonicalizationStats.unresolved,
            pendingDiscoveries: autoFallback.pendingDiscoveries,
          },
        },
      },
      null,
      2
    )
  );
}

main();
