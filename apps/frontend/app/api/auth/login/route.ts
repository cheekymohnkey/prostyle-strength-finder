import { NextRequest, NextResponse } from "next/server";
import { absoluteUrl, loadFrontendAuthConfig } from "@/lib/auth/config";
import { createPkceChallenge, createPkceVerifier, createRandomState } from "@/lib/auth/pkce";
import { setPkceCookies } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET(_request: NextRequest) {
  const config = loadFrontendAuthConfig();
  if (config.authMode === "disabled") {
    return NextResponse.redirect(new URL(config.appBaseUrl));
  }
  if (!config.cognitoHostedUiBaseUrl || !config.cognitoClientId) {
    return NextResponse.redirect(new URL(`${config.appBaseUrl}?authError=missing_cognito_config`));
  }
  const state = createRandomState();
  const verifier = createPkceVerifier();
  const challenge = createPkceChallenge(verifier);
  const redirectUri = absoluteUrl(config.appBaseUrl, config.redirectPath);

  const authorizeUrl = new URL(`${config.cognitoHostedUiBaseUrl}/oauth2/authorize`);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", config.cognitoClientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("scope", "openid profile email");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set("code_challenge", challenge);

  const response = NextResponse.redirect(authorizeUrl);
  setPkceCookies(response, { state, verifier }, config);
  return response;
}
