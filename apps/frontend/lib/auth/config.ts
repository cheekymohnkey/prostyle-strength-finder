export type FrontendAuthConfig = {
  appEnv: string;
  authMode: "cognito" | "disabled";
  apiBaseUrl: string;
  appBaseUrl: string;
  cognitoClientId: string | null;
  cognitoHostedUiBaseUrl: string | null;
  cognitoIssuer: string | null;
  cognitoAudience: string | null;
  redirectPath: string;
  postLogoutRedirectPath: string;
  sessionCookieName: string;
  sessionSecret: string;
  localAuthBypassSubject: string;
  localAuthBypassEmail: string | null;
};

function requireEnv(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value.trim();
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizePath(value: string): string {
  if (!value.startsWith("/")) {
    return `/${value}`;
  }
  return value;
}

function parseAuthMode(value: string | undefined): "cognito" | "disabled" {
  const normalized = (value || "").trim().toLowerCase();
  if (normalized === "") {
    return "cognito";
  }
  if (normalized === "cognito" || normalized === "disabled") {
    return normalized;
  }
  throw new Error(`Invalid FRONTEND_AUTH_MODE: ${value}`);
}

export function loadFrontendAuthConfig(): FrontendAuthConfig {
  const appEnv = requireEnv("APP_ENV", "local");
  const appBaseUrl = normalizeBaseUrl(
    requireEnv("NEXT_PUBLIC_APP_BASE_URL", "http://127.0.0.1:3000")
  );
  const isLocal = appEnv === "local";
  const authMode = parseAuthMode(process.env.FRONTEND_AUTH_MODE || (isLocal ? "disabled" : "cognito"));

  if (authMode === "disabled" && !isLocal) {
    throw new Error("FRONTEND_AUTH_MODE=disabled is only allowed when APP_ENV=local");
  }

  const cognitoClientId = authMode === "cognito"
    ? requireEnv("COGNITO_CLIENT_ID", isLocal ? "local-client-id" : undefined)
    : null;
  const cognitoHostedUiBaseUrl = authMode === "cognito"
    ? normalizeBaseUrl(
      requireEnv(
        "COGNITO_HOSTED_UI_BASE_URL",
        isLocal ? "https://example.auth.us-east-1.amazoncognito.com" : undefined
      )
    )
    : null;
  const cognitoIssuer = requireEnv(
    "COGNITO_ISSUER",
    isLocal ? "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_localpool" : undefined
  );
  const cognitoAudience = requireEnv("COGNITO_AUDIENCE", isLocal ? "local-client-id" : undefined);

  return {
    appEnv,
    authMode,
    apiBaseUrl: requireEnv("NEXT_PUBLIC_API_BASE_URL", "http://127.0.0.1:3001/v1"),
    appBaseUrl,
    cognitoClientId,
    cognitoHostedUiBaseUrl,
    cognitoIssuer,
    cognitoAudience,
    redirectPath: normalizePath(requireEnv("COGNITO_REDIRECT_PATH", "/api/auth/callback")),
    postLogoutRedirectPath: normalizePath(requireEnv("COGNITO_POST_LOGOUT_REDIRECT_PATH", "/")),
    sessionCookieName: requireEnv("FRONTEND_SESSION_COOKIE_NAME", "prostyle_frontend_session"),
    sessionSecret: requireEnv(
      "FRONTEND_SESSION_SECRET",
      isLocal ? "local-insecure-session-secret-change-me" : undefined
    ),
    localAuthBypassSubject: requireEnv("LOCAL_AUTH_BYPASS_SUBJECT", "frontend-local-user"),
    localAuthBypassEmail: process.env.LOCAL_AUTH_BYPASS_EMAIL?.trim() || null,
  };
}

export function absoluteUrl(baseUrl: string, path: string): string {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  const normalizedPath = normalizePath(path);
  return `${normalizedBase}${normalizedPath}`;
}
