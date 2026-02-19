const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DEFAULT_TRAIT_KEYS = [
  "dark_moody",
  "bright_airy",
  "graphic_novel",
  "photographic_realism",
  "cinematic_grade",
  "color_saturation",
  "minimalism",
  "raw_grit",
];
const TRAIT_SYSTEM_PROMPT_PATH = path.join(__dirname, "prompts", "trait-system.md");

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round3(value) {
  return Number(value.toFixed(3));
}

function deterministicTraitVector(seed) {
  const digest = crypto.createHash("sha256").update(seed).digest();
  const traitVector = {};
  for (let i = 0; i < DEFAULT_TRAIT_KEYS.length; i += 1) {
    const byte = digest[i];
    traitVector[DEFAULT_TRAIT_KEYS[i]] = round3(byte / 255);
  }
  return traitVector;
}

function sanitizeTraitVector(input) {
  const safe = {};
  for (const key of DEFAULT_TRAIT_KEYS) {
    const raw = Number(input?.[key]);
    safe[key] = Number.isFinite(raw) ? round3(clamp(raw, 0, 1)) : 0;
  }
  return safe;
}

function extractJsonObject(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("LLM response missing JSON object");
  }
  return JSON.parse(text.slice(start, end + 1));
}

function loadTraitSystemPrompt() {
  const prompt = fs.readFileSync(TRAIT_SYSTEM_PROMPT_PATH, "utf8").trim();
  if (!prompt) {
    throw new Error(`Trait system prompt is empty: ${TRAIT_SYSTEM_PROMPT_PATH}`);
  }
  return prompt;
}

async function callOpenAiTraitInference(openAi, input) {
  const promptText = String(input.promptText || "").trim();
  const imageId = String(input.imageId || "").trim();
  const runContext = input.runContext || {};

  const body = {
    model: openAi.model,
    messages: [
      {
        role: "system",
        content: loadTraitSystemPrompt(),
      },
      {
        role: "user",
        content: JSON.stringify({
          imageId,
          promptText,
          context: runContext,
        }),
      },
    ],
  };

  const response = await fetch(`${openAi.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${openAi.apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const responseJson = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = responseJson?.error?.message || `OpenAI request failed with status ${response.status}`;
    throw new Error(message);
  }

  const content = responseJson?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new Error("OpenAI response did not include message content");
  }

  const parsed = extractJsonObject(content);
  return sanitizeTraitVector(parsed);
}

function createTraitInferenceAdapter(config) {
  const mode = (config?.inference?.mode || "deterministic").trim();
  const openAi = config?.inference?.openAi || {};

  if (mode === "llm" && (!openAi.apiKey || openAi.apiKey.trim() === "")) {
    throw new Error("TRAIT_INFERENCE_MODE=llm requires OPENAI_API_KEY");
  }

  return {
    mode,
    async infer(input) {
      const seed = [
        input.imageId || "",
        input.promptText || "",
        input.modelFamily || "",
        input.modelVersion || "",
      ].join("|");

      if (mode !== "llm") {
        return {
          traitSchemaVersion: "v1",
          traitVector: deterministicTraitVector(seed),
          evidenceSummary: "deterministic_trait_scaffold_v1",
          provider: "deterministic",
        };
      }

      const traitVector = await callOpenAiTraitInference(openAi, input);
      return {
        traitSchemaVersion: "v1",
        traitVector,
        evidenceSummary: `llm_trait_inference_openai_${openAi.model}`,
        provider: "openai",
      };
    },
  };
}

module.exports = {
  DEFAULT_TRAIT_KEYS,
  TRAIT_SYSTEM_PROMPT_PATH,
  createTraitInferenceAdapter,
};
