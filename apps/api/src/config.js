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
