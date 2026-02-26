import { NextRequest, NextResponse } from "next/server";
import { loadFrontendAuthConfig } from "@/lib/auth/config";
import { exchangeAuthCodeForSession } from "@/lib/auth/cognito";
import { createPkceChallenge } from "@/lib/auth/pkce";
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
    const oauthErrorDesc = request.nextUrl.searchParams.get("error_description") || oauthError;
    return buildRedirectWithError(config.appBaseUrl, `oauth_denied:${oauthErrorDesc}`);
  }
  if (!code || !returnedState) {
    return buildRedirectWithError(config.appBaseUrl, "missing_code_or_state");
  }

  const pkce = await readPkceCookies();
  if (!pkce.state || !pkce.verifier || pkce.state !== returnedState) {
    const debugInfo = `state_cookie=${pkce.state ? "present" : "missing"} verifier_cookie=${pkce.verifier ? "present" : "missing"} state_match=${pkce.state === returnedState}`;
    return buildRedirectWithError(config.appBaseUrl, `invalid_state:${debugInfo}`);
  }

  // Debug: recompute the challenge so we can compare against what was sent to Cognito
  const verifierLen = pkce.verifier.length;
  const recomputedChallenge = createPkceChallenge(pkce.verifier);

  try {
    const session = await exchangeAuthCodeForSession(config, {
      code,
      codeVerifier: pkce.verifier,
    });
    const response = NextResponse.redirect(new URL(config.appBaseUrl));
    setSessionCookie(response, session, config);
    clearPkceCookies(response, config);
    return response;
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown";
    const debugInfo = `verifier_len=${verifierLen} challenge=${recomputedChallenge.slice(0, 12)}... code_len=${code.length}`;
    return buildRedirectWithError(config.appBaseUrl, `token_exchange_failed:${reason} [pkce:${debugInfo}]`);
  }
}
