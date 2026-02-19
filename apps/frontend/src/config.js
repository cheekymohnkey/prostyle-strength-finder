function requireEnv(key) {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value.trim();
}

function loadFrontendConfig() {
  const frontendPortRaw = process.env.FRONTEND_PORT || "3000";
  const frontendPort = Number.parseInt(frontendPortRaw, 10);
  if (!Number.isInteger(frontendPort)) {
    throw new Error(`Invalid FRONTEND_PORT: ${frontendPortRaw}`);
  }

  return {
    apiBaseUrl: requireEnv("NEXT_PUBLIC_API_BASE_URL"),
    appEnv: requireEnv("APP_ENV"),
    frontendPort,
  };
}

module.exports = {
  loadFrontendConfig,
};
