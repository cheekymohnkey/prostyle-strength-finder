const REQUIRED_ENV_KEYS = [
  "NODE_ENV",
  "APP_ENV",
  "PORT",
  "DATABASE_URL",
  "SQS_QUEUE_URL",
  "SQS_DLQ_URL",
  "SQS_MAX_ATTEMPTS",
  "SQS_RETRY_BASE_MS",
  "S3_BUCKET",
  "AWS_REGION",
  "COGNITO_USER_POOL_ID",
  "COGNITO_CLIENT_ID",
  "COGNITO_ISSUER",
  "COGNITO_AUDIENCE",
  "DEFAULT_STANDARD_MODEL_VERSION",
  "DEFAULT_NIJI_MODEL_VERSION",
  "LOG_LEVEL",
  "SERVICE_NAME",
];

function requireEnv(key) {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value.trim();
}

function parseIntStrict(value, key) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Invalid integer for ${key}: ${value}`);
  }
  return parsed;
}

function loadConfig() {
  REQUIRED_ENV_KEYS.forEach(requireEnv);

  const config = {
    runtime: {
      nodeEnv: requireEnv("NODE_ENV"),
      appEnv: requireEnv("APP_ENV"),
      port: parseIntStrict(requireEnv("PORT"), "PORT"),
    },
    database: {
      databaseUrl: requireEnv("DATABASE_URL"),
    },
    queue: {
      queueUrl: requireEnv("SQS_QUEUE_URL"),
      dlqUrl: requireEnv("SQS_DLQ_URL"),
      maxAttempts: parseIntStrict(requireEnv("SQS_MAX_ATTEMPTS"), "SQS_MAX_ATTEMPTS"),
      retryBaseMs: parseIntStrict(requireEnv("SQS_RETRY_BASE_MS"), "SQS_RETRY_BASE_MS"),
      adapterMode: process.env.QUEUE_ADAPTER_MODE || null,
    },
    storage: {
      bucket: requireEnv("S3_BUCKET"),
      region: requireEnv("AWS_REGION"),
      endpoint: process.env.S3_ENDPOINT_OVERRIDE || null,
    },
    auth: {
      userPoolId: requireEnv("COGNITO_USER_POOL_ID"),
      clientId: requireEnv("COGNITO_CLIENT_ID"),
      issuer: requireEnv("COGNITO_ISSUER"),
      audience: requireEnv("COGNITO_AUDIENCE"),
      jwtVerificationMode: process.env.AUTH_JWT_VERIFICATION_MODE
        || (requireEnv("APP_ENV") === "local" ? "insecure" : "jwks"),
      jwksCacheTtlSec: parseIntStrict(process.env.AUTH_JWKS_CACHE_TTL_SEC || "600", "AUTH_JWKS_CACHE_TTL_SEC"),
    },
    models: {
      defaultStandardVersion: requireEnv("DEFAULT_STANDARD_MODEL_VERSION"),
      defaultNijiVersion: requireEnv("DEFAULT_NIJI_MODEL_VERSION"),
    },
    inference: {
      mode: (process.env.TRAIT_INFERENCE_MODE || "deterministic").trim(),
      openAi: {
        apiKey: process.env.OPENAI_API_KEY || "",
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
      },
    },
    observability: {
      logLevel: requireEnv("LOG_LEVEL"),
      serviceName: requireEnv("SERVICE_NAME"),
      includeCorrelationIds: process.env.LOG_INCLUDE_CORRELATION_IDS !== "false",
    },
  };

  return config;
}

module.exports = {
  REQUIRED_ENV_KEYS,
  loadConfig,
};
