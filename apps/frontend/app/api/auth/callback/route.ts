import { NextRequest, NextResponse } from "next/server";
import { loadFrontendAuthConfig } from "@/lib/auth/config";
import { exchangeAuthCodeForSession } from "@/lib/auth/cognito";
import { createPkceChallenge } from "@/lib/auth/pkce";
import { clearPkceCookies, setSessionCookie, readPkceCookies } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  // Clear PKCE cookies immediately — before the token exchange — so that any duplicate
  // callback request (e.g. Nginx retry) hits invalid_state rather than burning the code twice.
  const clearResponse = new NextResponse(null, { status: 200 });
  clearPkceCookies(clearResponse, config);
  // We'll transfer these cleared cookies to the final response below.

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
    // Copy the already-cleared PKCE cookie deletions onto the success response
    clearResponse.cookies.getAll().forEach(c => response.cookies.set(c));
    return response;
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown";
    const debugInfo = `code=${codePreview}(len=${code.length}) verifier_len=${verifierLen} challenge_match=${challengeMatch} sent=${(pkce.sentChallenge ?? "null").slice(0, 12)}... computed=${recomputedChallenge.slice(0, 12)}...`;
    const errResponse = buildRedirectWithError(config.appBaseUrl, `token_exchange_failed:${reason} [pkce:${debugInfo}]`);
    // Still propagate the cookie deletions even on failure
    clearResponse.cookies.getAll().forEach(c => errResponse.cookies.set(c));
    return errResponse;
  }
}
