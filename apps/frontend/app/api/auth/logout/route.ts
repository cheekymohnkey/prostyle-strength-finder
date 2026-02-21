import { NextResponse } from "next/server";
import { absoluteUrl, loadFrontendAuthConfig } from "@/lib/auth/config";
import { clearSessionCookie } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET() {
  const config = loadFrontendAuthConfig();
  if (config.authMode === "disabled") {
    const response = NextResponse.redirect(new URL(config.appBaseUrl));
    clearSessionCookie(response, config);
    return response;
  }
  if (!config.cognitoHostedUiBaseUrl || !config.cognitoClientId) {
    const response = NextResponse.redirect(new URL(`${config.appBaseUrl}?authError=missing_cognito_config`));
    clearSessionCookie(response, config);
    return response;
  }
  const logoutUrl = new URL(`${config.cognitoHostedUiBaseUrl}/logout`);
  logoutUrl.searchParams.set("client_id", config.cognitoClientId);
  logoutUrl.searchParams.set(
    "logout_uri",
    absoluteUrl(config.appBaseUrl, config.postLogoutRedirectPath)
  );

  const response = NextResponse.redirect(logoutUrl);
  clearSessionCookie(response, config);
  return response;
}
