import { NextRequest, NextResponse } from "next/server";
import { loadFrontendAuthConfig } from "@/lib/auth/config";
import { refreshSession } from "@/lib/auth/cognito";
import {
  clearSessionCookie,
  createUnsignedLocalAccessToken,
  isSessionExpired,
  readSessionFromCookies,
  setSessionCookie,
  type FrontendAuthSession,
} from "@/lib/auth/session";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

function buildTargetUrl(baseApiUrl: string, pathParts: string[] | undefined, requestUrl: URL): string {
  const base = baseApiUrl.replace(/\/+$/, "");
  const joined = (pathParts || []).map(encodeURIComponent).join("/");
  const url = joined ? `${base}/${joined}` : base;
  const target = new URL(url);
  requestUrl.searchParams.forEach((value, key) => {
    target.searchParams.append(key, value);
  });
  return target.toString();
}

async function forwardToApi(
  request: NextRequest,
  targetUrl: string,
  session: FrontendAuthSession
): Promise<Response> {
  const method = request.method.toUpperCase();
  const hasBody = !["GET", "HEAD"].includes(method);
  const body = hasBody ? await request.arrayBuffer() : undefined;
  const contentType = request.headers.get("content-type");

  return fetch(targetUrl, {
    method,
    headers: {
      ...(contentType ? { "content-type": contentType } : {}),
      authorization: `Bearer ${session.accessToken}`,
      "x-request-id": request.headers.get("x-request-id") || crypto.randomUUID(),
    },
    body,
    cache: "no-store",
  });
}

function proxyResponse(upstream: Response): Promise<NextResponse> {
  return upstream.arrayBuffer().then((buffer) => {
    const response = new NextResponse(buffer, {
      status: upstream.status,
    });
    const contentType = upstream.headers.get("content-type");
    const requestId = upstream.headers.get("x-request-id");
    if (contentType) {
      response.headers.set("content-type", contentType);
    }
    if (requestId) {
      response.headers.set("x-request-id", requestId);
    }
    return response;
  });
}

async function handleProxy(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const config = loadFrontendAuthConfig();
  const { path } = await context.params;
  const targetUrl = buildTargetUrl(config.apiBaseUrl, path, request.nextUrl);

  if (config.authMode === "disabled") {
    // Local-only compatibility: allow smoke scripts to inject explicit bearer tokens.
    const headerToken =
      request.headers.get("x-auth-token")
      || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim()
      || null;
    const resolvedToken =
      headerToken && headerToken.length > 0
        ? headerToken
        : createUnsignedLocalAccessToken({
            issuer: config.cognitoIssuer || "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_localpool",
            audience: config.cognitoAudience || "local-client-id",
            subject: config.localAuthBypassSubject,
            email: config.localAuthBypassEmail,
            expiresInSec: 3600,
          });
    const localToken = createUnsignedLocalAccessToken({
      issuer: config.cognitoIssuer || "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_localpool",
      audience: config.cognitoAudience || "local-client-id",
      subject: config.localAuthBypassSubject,
      email: config.localAuthBypassEmail,
      expiresInSec: 3600,
    });
    const upstream = await forwardToApi(request, targetUrl, {
      accessToken: resolvedToken || localToken,
      refreshToken: null,
      idToken: null,
      tokenType: "Bearer",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });
    return proxyResponse(upstream);
  }

  const existingSession = await readSessionFromCookies(config);

  if (!existingSession) {
    return NextResponse.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "No authenticated session",
        },
      },
      { status: 401 }
    );
  }

  let activeSession = existingSession;
  let refreshedSession: FrontendAuthSession | null = null;

  if (isSessionExpired(existingSession) && existingSession.refreshToken) {
    try {
      activeSession = await refreshSession(config, existingSession);
      refreshedSession = activeSession;
    } catch (_error) {
      const response = NextResponse.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Session expired and refresh failed",
          },
        },
        { status: 401 }
      );
      clearSessionCookie(response, config);
      return response;
    }
  }

  let upstream = await forwardToApi(request, targetUrl, activeSession);
  if (upstream.status === 401 && activeSession.refreshToken) {
    try {
      activeSession = await refreshSession(config, activeSession);
      refreshedSession = activeSession;
      upstream = await forwardToApi(request, targetUrl, activeSession);
    } catch (_error) {
      const response = NextResponse.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Unauthorized and refresh failed",
          },
        },
        { status: 401 }
      );
      clearSessionCookie(response, config);
      return response;
    }
  }

  const response = await proxyResponse(upstream);
  if (refreshedSession) {
    setSessionCookie(response, refreshedSession, config);
  }
  if (upstream.status === 401) {
    clearSessionCookie(response, config);
  }
  return response;
}

export async function GET(request: NextRequest, context: RouteContext) {
  return handleProxy(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return handleProxy(request, context);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return handleProxy(request, context);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return handleProxy(request, context);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return handleProxy(request, context);
}
