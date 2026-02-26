import { absoluteUrl, type FrontendAuthConfig } from "@/lib/auth/config";
import type { FrontendAuthSession } from "@/lib/auth/session";

type TokenResponse = {
  access_token: string;
  id_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
};

function asFormBody(input: Record<string, string>): string {
  const params = new URLSearchParams();
  Object.entries(input).forEach(([key, value]) => {
    params.set(key, value);
  });
  return params.toString();
}

async function postTokenRequest(config: FrontendAuthConfig, formInput: Record<string, string>): Promise<TokenResponse> {
  if (!config.cognitoHostedUiBaseUrl) {
    throw new Error("Cognito auth mode is disabled");
  }
  const tokenEndpoint = `${config.cognitoHostedUiBaseUrl}/oauth2/token`;
  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: asFormBody(formInput),
    cache: "no-store",
  });

  const json = await response.json().catch(() => null);
  if (!response.ok || !json || typeof json.access_token !== "string") {
    const errorCode = json && typeof json.error === "string" ? json.error : "unknown_error";
    const reason = json && typeof json.error_description === "string"
      ? json.error_description
      : `status=${response.status} error=${errorCode}`;
    throw new Error(reason);
  }

  return json as TokenResponse;
}

export async function exchangeAuthCodeForSession(
  config: FrontendAuthConfig,
  input: { code: string; codeVerifier: string }
): Promise<FrontendAuthSession> {
  if (!config.cognitoClientId) {
    throw new Error("Cognito auth mode is disabled");
  }
  const redirectUri = absoluteUrl(config.appBaseUrl, config.redirectPath);
  const tokenParams: Record<string, string> = {
    grant_type: "authorization_code",
    client_id: config.cognitoClientId,
    code: input.code,
    redirect_uri: redirectUri,
    code_verifier: input.codeVerifier,
  };
  // If the App Client has a secret, it must be included in the token request
  if (config.cognitoClientSecret) {
    tokenParams.client_secret = config.cognitoClientSecret;
  }
  const token = await postTokenRequest(config, tokenParams).catch((err: Error) => {
    throw new Error(`${err.message} [redirect_uri=${redirectUri}] [client_id=${config.cognitoClientId}] [token_endpoint=${config.cognitoHostedUiBaseUrl}/oauth2/token]`);
  });

  return {
    accessToken: token.access_token,
    refreshToken: typeof token.refresh_token === "string" ? token.refresh_token : null,
    idToken: typeof token.id_token === "string" ? token.id_token : null,
    tokenType: typeof token.token_type === "string" ? token.token_type : "Bearer",
    expiresAt: Math.floor(Date.now() / 1000) + Math.max(30, Number(token.expires_in || 3600)),
  };
}

export async function refreshSession(
  config: FrontendAuthConfig,
  existing: FrontendAuthSession
): Promise<FrontendAuthSession> {
  if (!config.cognitoClientId) {
    throw new Error("Cognito auth mode is disabled");
  }
  if (!existing.refreshToken) {
    throw new Error("Missing refresh token");
  }

  const refreshParams: Record<string, string> = {
    grant_type: "refresh_token",
    client_id: config.cognitoClientId,
    refresh_token: existing.refreshToken,
  };
  if (config.cognitoClientSecret) {
    refreshParams.client_secret = config.cognitoClientSecret;
  }
  const token = await postTokenRequest(config, refreshParams);

  return {
    accessToken: token.access_token,
    refreshToken: typeof token.refresh_token === "string" ? token.refresh_token : existing.refreshToken,
    idToken: typeof token.id_token === "string" ? token.id_token : existing.idToken,
    tokenType: typeof token.token_type === "string" ? token.token_type : existing.tokenType || "Bearer",
    expiresAt: Math.floor(Date.now() / 1000) + Math.max(30, Number(token.expires_in || 3600)),
  };
}
