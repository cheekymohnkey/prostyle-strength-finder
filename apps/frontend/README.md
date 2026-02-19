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
