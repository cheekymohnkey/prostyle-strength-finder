import { NextResponse } from "next/server";
import { loadFrontendAuthConfig } from "@/lib/auth/config";
import { decodeJwtPayload, readSessionFromCookies } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET() {
  const config = loadFrontendAuthConfig();
  if (config.authMode === "disabled") {
    return NextResponse.json({
      authenticated: true,
      bypassAuth: true,
      session: {
        expiresAt: null,
        expiresInSec: null,
        subject: config.localAuthBypassSubject,
        email: config.localAuthBypassEmail,
        tokenType: "Bypass",
      },
    });
  }
  const session = await readSessionFromCookies(config);

  if (!session) {
    return NextResponse.json({
      authenticated: false,
    });
  }

  const accessClaims = decodeJwtPayload(session.accessToken);
  const sub = accessClaims && typeof accessClaims.sub === "string" ? accessClaims.sub : null;
  const email = accessClaims && typeof accessClaims.email === "string" ? accessClaims.email : null;
  const nowSec = Math.floor(Date.now() / 1000);

  return NextResponse.json({
    authenticated: true,
    session: {
      expiresAt: session.expiresAt,
      expiresInSec: Math.max(0, session.expiresAt - nowSec),
      subject: sub,
      email,
      tokenType: session.tokenType,
    },
  });
}
