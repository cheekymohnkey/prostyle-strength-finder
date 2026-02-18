function requireEnv(key) {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value.trim();
}

function loadFrontendConfig() {
  return {
    apiBaseUrl: requireEnv("NEXT_PUBLIC_API_BASE_URL"),
    appEnv: requireEnv("APP_ENV"),
  };
}

module.exports = {
  loadFrontendConfig,
};
