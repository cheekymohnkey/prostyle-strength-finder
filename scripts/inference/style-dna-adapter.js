const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const STYLE_DNA_SYSTEM_PROMPT_PATH = path.join(__dirname, "prompts", "style-dna-baseline-comparison-system.md");
const STYLE_DNA_SCHEMA_PATH = path.join(__dirname, "schemas", "style-dna-profile-analysis.schema.json");

function loadStyleDnaSystemPrompt() {
  const prompt = fs.readFileSync(STYLE_DNA_SYSTEM_PROMPT_PATH, "utf8").trim();
  if (!prompt) {
    throw new Error(`Style-DNA system prompt is empty: ${STYLE_DNA_SYSTEM_PROMPT_PATH}`);
  }
  return prompt;
}

function loadStyleDnaSchema() {
  const raw = fs.readFileSync(STYLE_DNA_SCHEMA_PATH, "utf8").trim();
  if (!raw) {
    throw new Error(`Style-DNA schema is empty: ${STYLE_DNA_SCHEMA_PATH}`);
  }
  return JSON.parse(raw);
}

function extractJsonObject(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("LLM response missing JSON object");
  }
  return JSON.parse(text.slice(start, end + 1));
}

function ensureStringArray(value) {
  const input = Array.isArray(value) ? value : [];
  const normalized = input
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item !== "");
  return normalized.length > 0 ? normalized : ["No change"];
}

function sanitizeStyleDnaResult(input) {
  const root = input && typeof input === "object" ? input : {};
  const profile = root.profile_analysis && typeof root.profile_analysis === "object"
    ? root.profile_analysis
    : {};
  const delta = profile.delta_strength && typeof profile.delta_strength === "object"
    ? profile.delta_strength
    : {};
  const extractedTraits = profile.extracted_traits && typeof profile.extracted_traits === "object"
    ? profile.extracted_traits
    : {};

  const rawScore = Number(delta.score_1_to_10);
  const score = Number.isFinite(rawScore)
    ? Math.max(1, Math.min(10, Math.round(rawScore)))
    : 1;

  const description = typeof delta.description === "string" && delta.description.trim() !== ""
    ? delta.description.trim()
    : "No meaningful delta detected.";

  const vibeShift = typeof profile.vibe_shift === "string" && profile.vibe_shift.trim() !== ""
    ? profile.vibe_shift.trim()
    : "No major stylistic vibe shift detected.";

  return {
    profile_analysis: {
      delta_strength: {
        score_1_to_10: score,
        description,
      },
      extracted_traits: {
        composition_and_structure: ensureStringArray(extractedTraits.composition_and_structure),
        lighting_and_contrast: ensureStringArray(extractedTraits.lighting_and_contrast),
        color_palette: ensureStringArray(extractedTraits.color_palette),
        texture_and_medium: ensureStringArray(extractedTraits.texture_and_medium),
      },
      vibe_shift: vibeShift,
      dominant_dna_tags: ensureStringArray(profile.dominant_dna_tags),
    },
  };
}

function deterministicStyleDnaResult(seed) {
  const digest = crypto.createHash("sha256").update(seed).digest("hex");
  const score = (parseInt(digest.slice(0, 2), 16) % 10) + 1;
  return {
    profile_analysis: {
      delta_strength: {
        score_1_to_10: score,
        description: "Deterministic fallback result for local scaffolding.",
      },
      extracted_traits: {
        composition_and_structure: ["No change"],
        lighting_and_contrast: ["No change"],
        color_palette: ["No change"],
        texture_and_medium: ["No change"],
      },
      vibe_shift: "No deterministic vibe shift inferred.",
      dominant_dna_tags: [
        `tag-${digest.slice(0, 4)}`,
        `tag-${digest.slice(4, 8)}`,
      ],
    },
  };
}

async function callOpenAiStyleDnaInference(openAi, input) {
  const body = {
    model: openAi.model,
    messages: [
      {
        role: "system",
        content: loadStyleDnaSystemPrompt(),
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              styleAdjustmentType: input.styleAdjustmentType,
              styleAdjustmentMidjourneyId: input.styleAdjustmentMidjourneyId,
              styleInfluenceId: input.styleInfluenceId,
              promptKey: input.promptKey,
              stylizeTier: input.stylizeTier,
            }),
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${input.baselineMimeType};base64,${input.baselineImageBase64}`,
            },
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${input.testMimeType};base64,${input.testImageBase64}`,
            },
          },
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "style_dna_profile_analysis",
        strict: true,
        schema: loadStyleDnaSchema(),
      },
    },
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
  if (typeof content === "string" && content.trim() !== "") {
    return sanitizeStyleDnaResult(extractJsonObject(content));
  }

  if (Array.isArray(content)) {
    const textPart = content.find((item) => item && item.type === "text" && typeof item.text === "string");
    if (textPart && typeof textPart.text === "string" && textPart.text.trim() !== "") {
      return sanitizeStyleDnaResult(extractJsonObject(textPart.text));
    }
  }

  throw new Error("OpenAI response did not include JSON content");
}

function createStyleDnaInferenceAdapter(config) {
  const mode = (config?.inference?.styleDnaMode || config?.inference?.mode || "deterministic").trim();
  const openAi = config?.inference?.openAi || {};

  if (mode === "llm" && (!openAi.apiKey || openAi.apiKey.trim() === "")) {
    throw new Error("STYLE_DNA_INFERENCE_MODE=llm requires OPENAI_API_KEY");
  }

  return {
    mode,
    async compare(input) {
      if (mode !== "llm") {
        const seed = [
          input.styleInfluenceId || "",
          input.styleAdjustmentType || "",
          input.styleAdjustmentMidjourneyId || "",
          input.promptKey || "",
          String(input.stylizeTier || ""),
          input.baselineImageId || "",
          input.testImageId || "",
        ].join("|");
        return {
          profileAnalysis: deterministicStyleDnaResult(seed),
          provider: "deterministic",
        };
      }

      const profileAnalysis = await callOpenAiStyleDnaInference(openAi, {
        styleAdjustmentType: input.styleAdjustmentType,
        styleAdjustmentMidjourneyId: input.styleAdjustmentMidjourneyId,
        styleInfluenceId: input.styleInfluenceId,
        promptKey: input.promptKey,
        stylizeTier: input.stylizeTier,
        baselineMimeType: input.baselineMimeType,
        baselineImageBase64: input.baselineImageBuffer.toString("base64"),
        testMimeType: input.testMimeType,
        testImageBase64: input.testImageBuffer.toString("base64"),
      });

      return {
        profileAnalysis,
        provider: `openai_${openAi.model}`,
      };
    },
  };
}

module.exports = {
  STYLE_DNA_SYSTEM_PROMPT_PATH,
  STYLE_DNA_SCHEMA_PATH,
  createStyleDnaInferenceAdapter,
};
