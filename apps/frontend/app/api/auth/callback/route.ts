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

  // Debug: log first/last chars of code to detect truncation
  const codePreview = `${code.slice(0, 8)}...${code.slice(-8)}`;

  const pkce = await readPkceCookies();
  if (!pkce.state || !pkce.verifier || pkce.state !== returnedState) {
    const debugInfo = `state_cookie=${pkce.state ? "present" : "missing"} verifier_cookie=${pkce.verifier ? "present" : "missing"} state_match=${pkce.state === returnedState} code=${codePreview}(len=${code.length})`;
    return buildRedirectWithError(config.appBaseUrl, `invalid_state:${debugInfo}`);
  }

  // Debug: compare the challenge sent to Cognito vs what we'd compute from the stored verifier
  const verifierLen = pkce.verifier.length;
  const recomputedChallenge = createPkceChallenge(pkce.verifier);
  const challengeMatch = pkce.sentChallenge === recomputedChallenge;

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
    const debugInfo = `code=${codePreview}(len=${code.length}) verifier_len=${verifierLen} challenge_match=${challengeMatch} sent=${(pkce.sentChallenge ?? "null").slice(0, 12)}... computed=${recomputedChallenge.slice(0, 12)}...`;
    return buildRedirectWithError(config.appBaseUrl, `token_exchange_failed:${reason} [pkce:${debugInfo}]`);
  }
}
