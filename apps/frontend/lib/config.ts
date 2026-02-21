export type FrontendRuntimeConfig = {
  apiBaseUrl: string;
  appBaseUrl: string;
  appEnv: string;
};

function readEnv(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value.trim();
}

export function loadFrontendRuntimeConfig(): FrontendRuntimeConfig {
  return {
    apiBaseUrl: readEnv("NEXT_PUBLIC_API_BASE_URL", "http://127.0.0.1:3001/v1"),
    appBaseUrl: readEnv("NEXT_PUBLIC_APP_BASE_URL", "http://127.0.0.1:3000"),
    appEnv: readEnv("APP_ENV", "local"),
  };
}
