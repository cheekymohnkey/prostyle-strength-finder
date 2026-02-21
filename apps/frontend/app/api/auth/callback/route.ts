import { NextRequest, NextResponse } from "next/server";
import { loadFrontendAuthConfig } from "@/lib/auth/config";
import { exchangeAuthCodeForSession } from "@/lib/auth/cognito";
import { clearPkceCookies, setSessionCookie, readPkceCookies } from "@/lib/auth/session";

export const runtime = "nodejs";

function buildRedirectWithError(baseUrl: string, code: string): NextResponse {
  const redirect = new URL(baseUrl);
  redirect.searchParams.set("authError", code);
  return NextResponse.redirect(redirect);
}

export async function GET(request: NextRequest) {
  const config = loadFrontendAuthConfig();
  if (config.authMode === "disabled") {
    return NextResponse.redirect(new URL(config.appBaseUrl));
  }
  const code = request.nextUrl.searchParams.get("code");
  const returnedState = request.nextUrl.searchParams.get("state");
  const oauthError = request.nextUrl.searchParams.get("error");

  if (oauthError) {
    return buildRedirectWithError(config.appBaseUrl, "oauth_denied");
  }
  if (!code || !returnedState) {
    return buildRedirectWithError(config.appBaseUrl, "missing_code_or_state");
  }

  const pkce = await readPkceCookies();
  if (!pkce.state || !pkce.verifier || pkce.state !== returnedState) {
    return buildRedirectWithError(config.appBaseUrl, "invalid_state");
  }

  try {
    const session = await exchangeAuthCodeForSession(config, {
      code,
      codeVerifier: pkce.verifier,
    });
    const response = NextResponse.redirect(new URL(config.appBaseUrl));
    setSessionCookie(response, session, config);
    clearPkceCookies(response, config);
    return response;
  } catch (_error) {
    return buildRedirectWithError(config.appBaseUrl, "token_exchange_failed");
  }
}
