const crypto = require("crypto");
const {
  ensureReady,
  ensureUser,
  updateUserRoleStatus,
  ensureBaselinePromptSuiteById,
  ensureBaselinePromptSuiteItemByPromptKey,
  upsertBaselinePromptSuiteItemMetadata,
  getBaselineRenderSetByCompatibility,
  insertBaselineRenderSet,
  getBaselineRenderSetById,
} = require("../db/repository");

const SUITE_ID = "suite_style_dna_default_v1";
const SUITE_NAME = "Style-DNA Canonical Default Suite V1";
const SUITE_VERSION = "v1";
const STYLIZE_TIERS = [0, 100, 1000];

const PROMPTS = [
  {
    promptKey: "pk_001",
    domain: "Portraiture",
    promptText: "a person looking at the camera",
    whatItTests: "How the style renders human skin tones, eyes, and facial structure.",
    displayOrder: 10,
  },
  {
    promptKey: "pk_002",
    domain: "Architecture",
    promptText: "the exterior of a house",
    whatItTests: "How the style handles rigid geometry, straight lines, and structural lighting.",
    displayOrder: 20,
  },
  {
    promptKey: "pk_003",
    domain: "Landscape",
    promptText: "a mountain range and a lake",
    whatItTests: "How the style interprets sky, atmospheric perspective, and organic textures.",
    displayOrder: 30,
  },
  {
    promptKey: "pk_004",
    domain: "Macro/Object",
    promptText: "a coffee cup on a table",
    whatItTests: "How the style renders material reflections (ceramic/glass), shadows, and close-up depth of field.",
    displayOrder: 40,
  },
  {
    promptKey: "pk_005",
    domain: "Interior",
    promptText: "a living room with a sofa",
    whatItTests: "How the style handles indoor, bounced, or artificial lighting.",
    displayOrder: 50,
  },
  {
    promptKey: "pk_006",
    domain: "Action",
    promptText: "a dog running",
    whatItTests: "How the style renders motion and fur/hair textures.",
    displayOrder: 60,
  },
  {
    promptKey: "pk_007",
    domain: "Vehicle",
    promptText: "a car parked on a street",
    whatItTests: "How the style handles metallic surfaces and sharp specular highlights.",
    displayOrder: 70,
  },
  {
    promptKey: "pk_008",
    domain: "Food",
    promptText: "a bowl of fruit",
    whatItTests: "How the style handles vibrant color palettes and organic, soft lighting.",
    displayOrder: 80,
  },
  {
    promptKey: "pk_009",
    domain: "Flora",
    promptText: "a single flower in bloom",
    whatItTests: "How the style handles delicate, translucent details and micro-textures.",
    displayOrder: 90,
  },
  {
    promptKey: "pk_010",
    domain: "Apparel",
    promptText: "a jacket hanging on a hook",
    whatItTests: "How the style interprets fabric folds, drapery, and textile textures.",
    displayOrder: 100,
  },
];

function stableStringify(value) {
  if (value === null || value === undefined) {
    return "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashParameterEnvelope(value) {
  return crypto.createHash("sha256").update(stableStringify(value || {})).digest("hex");
}

function resolveAdminUserId() {
  const preferred = String(process.env.LOCAL_AUTH_BYPASS_SUBJECT || "").trim();
  if (preferred !== "") {
    return preferred;
  }
  return "admin-style-dna-baseline-smoke-user";
}

function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const dbPath = ensureReady(databaseUrl);
  const adminUserId = resolveAdminUserId();
  ensureUser(dbPath, {
    userId: adminUserId,
    role: "admin",
    status: "active",
  });
  updateUserRoleStatus(dbPath, adminUserId, {
    role: "admin",
    status: "active",
  });

  const suite = ensureBaselinePromptSuiteById(dbPath, {
    suiteId: SUITE_ID,
    name: SUITE_NAME,
    suiteVersion: SUITE_VERSION,
    status: "active",
    createdBy: adminUserId,
  });

  for (const prompt of PROMPTS) {
    ensureBaselinePromptSuiteItemByPromptKey(dbPath, {
      itemId: `bpsi_${crypto.randomUUID()}`,
      suiteId: SUITE_ID,
      promptKey: prompt.promptKey,
      promptText: prompt.promptText,
      displayOrder: prompt.displayOrder,
    });
    upsertBaselinePromptSuiteItemMetadata(dbPath, {
      metadataId: `bpsm_${crypto.randomUUID()}`,
      suiteId: SUITE_ID,
      promptKey: prompt.promptKey,
      domain: prompt.domain,
      whatItTests: prompt.whatItTests,
    });
  }

  const seedValue = process.env.BASELINE_SEED ? Number(process.env.BASELINE_SEED) : 777;
  const baselineSets = [];
  for (const stylizeTier of STYLIZE_TIERS) {
    const parameterEnvelope = {
      aspectRatio: "1:1",
      seed: seedValue,
      quality: 1,
      styleRaw: true,
      stylizeTier,
      styleWeight: 0,
    };
    const parameterEnvelopeHash = hashParameterEnvelope(parameterEnvelope);
    let existing = getBaselineRenderSetByCompatibility(dbPath, {
      mjModelFamily: "standard",
      mjModelVersion: "7",
      suiteId: SUITE_ID,
      parameterEnvelopeHash,
    });
    if (!existing) {
      const baselineRenderSetId = `brs_${crypto.randomUUID()}`;
      insertBaselineRenderSet(dbPath, {
        baselineRenderSetId,
        mjModelFamily: "standard",
        mjModelVersion: "7",
        suiteId: SUITE_ID,
        parameterEnvelope,
        parameterEnvelopeHash,
        status: "active",
        createdBy: adminUserId,
      });
      existing = getBaselineRenderSetById(dbPath, baselineRenderSetId);
    }
    baselineSets.push({
      baselineRenderSetId: existing.baseline_render_set_id,
      stylizeTier,
      mjModelFamily: existing.mj_model_family,
      mjModelVersion: existing.mj_model_version,
      suiteId: existing.suite_id,
      createdAt: existing.created_at,
    });
  }

  console.log(JSON.stringify({
    ok: true,
    databaseUrl,
    suite: {
      suiteId: suite.suite_id,
      name: suite.name,
      suiteVersion: suite.suite_version,
      promptCount: PROMPTS.length,
    },
    baselineSets,
  }, null, 2));
}

main();
