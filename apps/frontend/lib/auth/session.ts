import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { FrontendAuthConfig } from "@/lib/auth/config";

export type FrontendAuthSession = {
  accessToken: string;
  refreshToken: string | null;
  idToken: string | null;
  tokenType: string;
  expiresAt: number;
};

const PKCE_STATE_COOKIE = "prostyle_auth_state";
const PKCE_VERIFIER_COOKIE = "prostyle_auth_verifier";
const PKCE_COOKIE_MAX_AGE_SEC = 10 * 60;
const SESSION_MAX_AGE_SEC = 7 * 24 * 60 * 60;

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value: string): string {
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function createSignature(payloadBase64: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadBase64).digest("base64url");
}

function cookieSecure(config: FrontendAuthConfig): boolean {
  return config.appEnv !== "local";
}

export function encodeSessionCookie(session: FrontendAuthSession, secret: string): string {
  const payloadBase64 = base64UrlEncode(JSON.stringify(session));
  const signature = createSignature(payloadBase64, secret);
  return `${payloadBase64}.${signature}`;
}

export function decodeSessionCookie(raw: string, secret: string): FrontendAuthSession | null {
  const segments = raw.split(".");
  if (segments.length !== 2) {
    return null;
  }

  const [payloadBase64, providedSignature] = segments;
  const expectedSignature = createSignature(payloadBase64, secret);
  const a = Buffer.from(providedSignature);
  const b = Buffer.from(expectedSignature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return null;
  }

  try {
    const decoded = JSON.parse(base64UrlDecode(payloadBase64));
    if (
      typeof decoded.accessToken !== "string"
      || typeof decoded.tokenType !== "string"
      || typeof decoded.expiresAt !== "number"
    ) {
      return null;
    }
    return {
      accessToken: decoded.accessToken,
      refreshToken: typeof decoded.refreshToken === "string" ? decoded.refreshToken : null,
      idToken: typeof decoded.idToken === "string" ? decoded.idToken : null,
      tokenType: decoded.tokenType,
      expiresAt: decoded.expiresAt,
    };
  } catch (_error) {
    return null;
  }
}

export async function readSessionFromCookies(config: FrontendAuthConfig): Promise<FrontendAuthSession | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(config.sessionCookieName)?.value;
  if (!raw) {
    return null;
  }
  return decodeSessionCookie(raw, config.sessionSecret);
}

export function setSessionCookie(
  response: NextResponse,
  session: FrontendAuthSession,
  config: FrontendAuthConfig
): void {
  response.cookies.set(config.sessionCookieName, encodeSessionCookie(session, config.sessionSecret), {
    httpOnly: true,
    secure: cookieSecure(config),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  });
}

export function clearSessionCookie(response: NextResponse, config: FrontendAuthConfig): void {
  response.cookies.set(config.sessionCookieName, "", {
    httpOnly: true,
    secure: cookieSecure(config),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export function setPkceCookies(
  response: NextResponse,
  input: { state: string; verifier: string },
  config: FrontendAuthConfig
): void {
  response.cookies.set(PKCE_STATE_COOKIE, input.state, {
    httpOnly: true,
    secure: cookieSecure(config),
    sameSite: "lax",
    path: "/",
    maxAge: PKCE_COOKIE_MAX_AGE_SEC,
  });
  response.cookies.set(PKCE_VERIFIER_COOKIE, input.verifier, {
    httpOnly: true,
    secure: cookieSecure(config),
    sameSite: "lax",
    path: "/",
    maxAge: PKCE_COOKIE_MAX_AGE_SEC,
  });
}

export async function readPkceCookies(): Promise<{ state: string | null; verifier: string | null }> {
  const cookieStore = await cookies();
  return {
    state: cookieStore.get(PKCE_STATE_COOKIE)?.value ?? null,
    verifier: cookieStore.get(PKCE_VERIFIER_COOKIE)?.value ?? null,
  };
}

export function clearPkceCookies(response: NextResponse, config: FrontendAuthConfig): void {
  response.cookies.set(PKCE_STATE_COOKIE, "", {
    httpOnly: true,
    secure: cookieSecure(config),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  response.cookies.set(PKCE_VERIFIER_COOKIE, "", {
    httpOnly: true,
    secure: cookieSecure(config),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export function isSessionExpired(session: FrontendAuthSession, skewSeconds = 30): boolean {
  const nowSec = Math.floor(Date.now() / 1000);
  return nowSec >= session.expiresAt - skewSeconds;
}

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const segments = token.split(".");
  if (segments.length < 2) {
    return null;
  }
  try {
    return JSON.parse(base64UrlDecode(segments[1]));
  } catch (_error) {
    return null;
  }
}

function base64UrlEncodeJson(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function createUnsignedLocalAccessToken(input: {
  issuer: string;
  audience: string;
  subject: string;
  email?: string | null;
  expiresInSec?: number;
}): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = base64UrlEncodeJson({ alg: "none", typ: "JWT" });
  const payload = base64UrlEncodeJson({
    iss: input.issuer,
    aud: input.audience,
    sub: input.subject,
    email: input.email || undefined,
    iat: nowSec,
    exp: nowSec + Math.max(30, input.expiresInSec || 3600),
  });
  return `${header}.${payload}.sig`;
}
