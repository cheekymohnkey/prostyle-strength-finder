const fs = require("fs");
const path = require("path");
const { createOpenAiDebugSession } = require("./openai-debug-log");

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

function createInferenceError(code, message, nonRetryable) {
  return Object.assign(new Error(message), {
    code,
    nonRetryable,
  });
}

function parseJsonObjectText(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw createInferenceError("STYLE_DNA_LLM_SCHEMA_INVALID", "LLM response missing JSON object", true);
  }
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch (_error) {
    throw createInferenceError("STYLE_DNA_LLM_SCHEMA_INVALID", "LLM response contained invalid JSON", true);
  }
}

function assertObject(value, pathLabel) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw createInferenceError("STYLE_DNA_LLM_SCHEMA_INVALID", `Invalid LLM payload: expected object at ${pathLabel}`, true);
  }
  return value;
}

function assertString(value, pathLabel) {
  if (typeof value !== "string" || value.trim() === "") {
    throw createInferenceError("STYLE_DNA_LLM_SCHEMA_INVALID", `Invalid LLM payload: expected non-empty string at ${pathLabel}`, true);
  }
  return value.trim();
}

function assertIntegerInRange(value, pathLabel, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw createInferenceError(
      "STYLE_DNA_LLM_SCHEMA_INVALID",
      `Invalid LLM payload: expected integer ${min}-${max} at ${pathLabel}`,
      true
    );
  }
  return value;
}

function assertStringArray(value, pathLabel) {
  if (!Array.isArray(value) || value.length === 0) {
    throw createInferenceError("STYLE_DNA_LLM_SCHEMA_INVALID", `Invalid LLM payload: expected non-empty string array at ${pathLabel}`, true);
  }
  const normalized = value.map((item, index) => assertString(item, `${pathLabel}[${index}]`));
  if (normalized.length === 0) {
    throw createInferenceError("STYLE_DNA_LLM_SCHEMA_INVALID", `Invalid LLM payload: expected non-empty string array at ${pathLabel}`, true);
  }
  return normalized;
}

function validateStyleDnaSchemaPayload(input) {
  const root = assertObject(input, "root");
  const profile = assertObject(root.profile_analysis, "root.profile_analysis");
  const deltaStrength = assertObject(profile.delta_strength, "root.profile_analysis.delta_strength");
  const extractedTraits = assertObject(profile.extracted_traits, "root.profile_analysis.extracted_traits");

  return {
    profile_analysis: {
      delta_strength: {
        score_1_to_10: assertIntegerInRange(
          deltaStrength.score_1_to_10,
          "root.profile_analysis.delta_strength.score_1_to_10",
          1,
          10
        ),
        description: assertString(deltaStrength.description, "root.profile_analysis.delta_strength.description"),
      },
      extracted_traits: {
        composition_and_structure: assertStringArray(
          extractedTraits.composition_and_structure,
          "root.profile_analysis.extracted_traits.composition_and_structure"
        ),
        lighting_and_contrast: assertStringArray(
          extractedTraits.lighting_and_contrast,
          "root.profile_analysis.extracted_traits.lighting_and_contrast"
        ),
        color_palette: assertStringArray(
          extractedTraits.color_palette,
          "root.profile_analysis.extracted_traits.color_palette"
        ),
        texture_and_medium: assertStringArray(
          extractedTraits.texture_and_medium,
          "root.profile_analysis.extracted_traits.texture_and_medium"
        ),
      },
      vibe_shift: assertString(profile.vibe_shift, "root.profile_analysis.vibe_shift"),
      dominant_dna_tags: assertStringArray(profile.dominant_dna_tags, "root.profile_analysis.dominant_dna_tags"),
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

  const debug = createOpenAiDebugSession({
    adapter: "style_dna",
    operation: "chat.completions",
    model: openAi.model,
    url: `${openAi.baseUrl}/chat/completions`,
  });
  const requestBodyRaw = JSON.stringify(body);
  debug.logRequest(requestBodyRaw);

  const response = await fetch(`${openAi.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${openAi.apiKey}`,
    },
    body: requestBodyRaw,
  });

  const responseBodyRaw = await response.text();
  debug.logResponse({
    status: response.status,
    bodyRaw: responseBodyRaw,
  });
  const responseJson = (() => {
    try {
      return JSON.parse(responseBodyRaw);
    } catch (_error) {
      return {};
    }
  })();
  if (!response.ok) {
    const message = responseJson?.error?.message || `OpenAI request failed with status ${response.status}`;
    debug.logError(message);
    throw createInferenceError("STYLE_DNA_LLM_UPSTREAM_ERROR", message, false);
  }

  const content = responseJson?.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim() !== "") {
    return validateStyleDnaSchemaPayload(parseJsonObjectText(content));
  }

  if (Array.isArray(content)) {
    const textPart = content.find((item) => item && item.type === "text" && typeof item.text === "string");
    if (textPart && typeof textPart.text === "string" && textPart.text.trim() !== "") {
      return validateStyleDnaSchemaPayload(parseJsonObjectText(textPart.text));
    }
  }

  throw createInferenceError("STYLE_DNA_LLM_SCHEMA_INVALID", "OpenAI response did not include JSON content", true);
}

function createStyleDnaInferenceAdapter(config) {
  const mode = (config?.inference?.styleDnaMode || "llm").trim();
  const openAi = config?.inference?.openAi || {};

  if (mode !== "llm") {
    throw createInferenceError(
      "STYLE_DNA_LLM_ONLY_MODE_REQUIRED",
      `STYLE_DNA_INFERENCE_MODE must be llm for Style-DNA runs; received: ${mode || "(empty)"}`,
      true
    );
  }

  if (!openAi.apiKey || openAi.apiKey.trim() === "") {
    throw createInferenceError("STYLE_DNA_LLM_CONFIG_INVALID", "STYLE_DNA_INFERENCE_MODE=llm requires OPENAI_API_KEY", true);
  }

  return {
    mode,
    async compare(input) {
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
