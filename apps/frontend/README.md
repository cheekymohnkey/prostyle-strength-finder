# Frontend App

Responsibility:
- Provide user/admin web flows.
- Call API endpoints and surface async job status/results.
- Render recommendation, feedback, and governance UX.

Current local MVP-1 flow:
- Serves one recommendation page at `/`.
- Uses same-origin `/api/*` proxy routes to call backend recommendation endpoints:
  - `POST /api/recommendation-extractions`
  - `POST /api/recommendation-extractions/:id/confirm`
  - `GET /api/recommendation-extractions/:id`
  - `GET /api/recommendation-sessions/:id`
- Requires `x-auth-token` (JWT) from page input to proxy authenticated backend calls.

Not owned here:
- Core domain/business rules implementation.

## Migration Note (UI Upgrade Phase U1)

This workspace now contains two frontend entrypoints:
1. Next.js frontend (current default):
- `npm run dev --workspace=@prostyle/frontend`
2. Legacy frontend server (fallback only):
- `npm run dev:legacy --workspace=@prostyle/frontend`

The Next.js app is the active migration target for `design-documenatation/UI_UPGRADE_IMPLEMENTATION_PLAN.md`.

## U2 Auth Routes (Next.js app)

1. `GET /api/auth/login`
- Redirects to Cognito Hosted UI authorize endpoint with PKCE.
2. `GET /api/auth/callback`
- Exchanges authorization code for tokens and sets frontend session cookie.
3. `GET /api/auth/session`
- Returns current authenticated session summary for UI checks.
4. `GET /api/auth/logout`
- Clears frontend session and redirects through Cognito logout endpoint.

Required auth env vars for Next.js flow:
0. `FRONTEND_AUTH_MODE` (`cognito|disabled`; `disabled` is local-only bypass)
1. `COGNITO_CLIENT_ID`
2. `COGNITO_HOSTED_UI_BASE_URL`
3. `COGNITO_REDIRECT_PATH` (optional, default `/api/auth/callback`)
4. `COGNITO_POST_LOGOUT_REDIRECT_PATH` (optional, default `/`)
5. `FRONTEND_SESSION_SECRET`
6. `FRONTEND_SESSION_COOKIE_NAME` (optional)
7. `NEXT_PUBLIC_API_BASE_URL`
8. `NEXT_PUBLIC_APP_BASE_URL`

Local bypass mode:
1. Set `FRONTEND_AUTH_MODE=disabled`.
2. Optional identity override:
- `LOCAL_AUTH_BYPASS_SUBJECT`
- `LOCAL_AUTH_BYPASS_EMAIL`
3. In bypass mode, `/api/proxy/*` uses a local unsigned bearer token compatible with local API `AUTH_JWT_VERIFICATION_MODE=insecure`.

## U2 API Proxy (Next.js app)

1. `ALL /api/proxy/*`
- Forwards to `NEXT_PUBLIC_API_BASE_URL/*` with server-side bearer token injection.
- Attempts a single refresh-token retry on expired/401 session before failing.
