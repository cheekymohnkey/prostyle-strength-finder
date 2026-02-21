# Prostyle Strength Finder - UI Upgrade Implementation Plan

Status: In Progress  
Date: 2026-02-21  
Depends on:
- `design-documenatation/DECISIONS.md`
- `design-documenatation/ARCHITECTURE_AND_ERD.md`
- `design-documenatation/TECHNICAL_DECISIONS.md`

## Goal

Upgrade the frontend implementation to the documented stack and interaction model:
1. Next.js (App Router) + TypeScript.
2. Tailwind CSS + shadcn/ui.
3. TanStack Query for async server state.
4. Cognito Hosted UI + Google IdP sign-in flow (PKCE), replacing manual token entry for normal user flows.

## Current Execution Snapshot (2026-02-21)

Completed in implementation:
1. Next.js App Router + TypeScript foundation is active in `apps/frontend`.
2. Next.js is now default frontend dev entrypoint (`apps/frontend/package.json` `dev` script).
3. Legacy frontend remains available as fallback (`dev:legacy`) for controlled rollback window.
4. Hosted UI + PKCE auth route handlers exist in Next app:
- `/api/auth/login`
- `/api/auth/callback`
- `/api/auth/session`
- `/api/auth/logout`
5. Next proxy route (`/api/proxy/*`) is wired and used by migrated flows.
6. U3 recommendation + feedback migrated page exists (`apps/frontend/app/page.tsx`).
7. Initial U5 operations slice exists (`apps/frontend/app/admin/page.tsx`) for:
- approval policy get/update
- contributor submission create/list
- trigger/retry actions
8. Frontend smoke scripts now run against Next runtime (not legacy `src/index.js`):
- `frontend:critical-flow-smoke`
- `admin:frontend-proxy-smoke`
- `feedback:frontend-proxy-smoke`
9. Full launch readiness smoke passes with Next frontend flow active.

Remaining:
1. Complete U4/U5 parity coverage beyond current initial slices.
2. Implement Style-DNA admin UI workflow (`/admin/style-dna`) per dedicated plan/tasks docs.
3. Finalize legacy frontend deprecation/removal once parity and rollout confidence are complete.

## Why Now

1. Current frontend implementation diverges from agreed technical decisions.
2. Auth flow in UI does not match documented Cognito Hosted UI approach.
3. Async analysis/recommendation UX is currently hand-rolled and harder to evolve safely.

## Scope

In scope:
1. Replace `apps/frontend` custom Node HTML server UI with Next.js + TypeScript app.
2. Implement UI pages/panels for:
- Recommendation extraction/confirm/session results.
- Post-result feedback.
- Trait job submit/status/result.
- Admin essentials currently exposed by MVP endpoints.
3. Implement frontend auth integration for Cognito Hosted UI + PKCE.
4. Preserve current backend `/v1/...` API contract and endpoint behavior.
5. Add minimal targeted frontend tests and smoke updates for launch gates.

Out of scope:
1. Backend framework migration (Fastify/TypeScript) in this plan.
2. Data model/schema redesign.
3. New product features beyond existing MVP flows.

## Constraints

1. Source-of-truth docs listed above are authoritative.
2. Existing launch/readiness smoke behavior must remain reproducible.
3. API contracts remain versioned under `/v1/...` with no breaking changes.
4. Upgrade should be incremental and reversible until final cutover.

## Delivery Strategy

Use an incremental cutover with a frontend-only migration:
1. Stand up new Next.js app in parallel.
2. Integrate existing API endpoints through typed client modules.
3. Migrate flows page-by-page with feature flags.
4. Switch default frontend entry once parity checks pass.
5. Keep rollback path to current frontend until post-cutover validation completes.

## Work Plan

## Phase U0: Decision/Contract Lock

Objective:
- Lock frontend upgrade boundaries and acceptance criteria before code migration.

Tasks:
1. Confirm stack target from `TECHNICAL_DECISIONS.md` for frontend.
2. Record final migration approach and cutover criteria in this plan.
3. Confirm auth UX acceptance criteria (Hosted UI login/logout/session refresh behavior).

Done when:
1. This plan is approved.
2. No unresolved frontend architecture questions remain for MVP.

## Phase U1: Frontend Foundation Bootstrap

Objective:
- Create production-ready Next.js frontend foundation.

Tasks:
1. Initialize Next.js (App Router) + TypeScript in `apps/frontend`.
2. Add Tailwind CSS and shadcn/ui baseline.
3. Add TanStack Query provider and shared API query/mutation wrappers.
4. Add environment contract mapping for frontend runtime config.
5. Add common error boundary/loading states and request tracing headers.

Done when:
1. App boots locally with typed build and lint passing.
2. Base layout, routing shell, and shared providers are in place.

## Phase U2: Auth Integration (Cognito Hosted UI + PKCE)

Objective:
- Replace manual token input with documented auth flow.

Tasks:
1. Implement Hosted UI login redirect and callback handling.
2. Implement secure token storage/session management strategy for MVP.
3. Attach bearer token automatically to API requests.
4. Implement logout and token-expiry handling (single retry after refresh where applicable).
5. Keep local developer override path only for explicit local testing mode.

Done when:
1. Authenticated user can complete login and call protected `/v1/...` endpoints from UI.
2. Manual token entry is removed from default user flow.

## Phase U3: Recommendation Flow Migration

Objective:
- Rebuild recommendation flow with typed forms and async state management.

Tasks:
1. Upload PNG flow -> metadata extraction submit.
2. Extraction review + explicit confirm flow.
3. Session fetch + ranked recommendation rendering.
4. Confidence/risk/low-confidence rendering parity with API output.
5. Error handling for malformed upload/metadata extraction failures.

Done when:
1. End-to-end recommendation flow works without legacy frontend.
2. Behavior matches documented thresholds and confirmation gate.

## Phase U4: Feedback and Trait Flow Migration

Objective:
- Preserve MVP-2 and trait job workflows in new UI.

Tasks:
1. Generated image upload path for feedback.
2. Feedback submission/list display with alignment output.
3. Trait job submit/status/result views using async polling/query.
4. Style-DNA paired-grid workflow UI:
- admin-only route/permissions
- style influence picker from stored srefs/moodboards
- paste-ready prompt generation blocks (copy actions)
- baseline-set selector (by MidJourney model/version)
- test grid paste/upload intake
- strict structured result rendering (structural/lighting/color/texture/tags).
5. Consistent loading/error/success UX across flows.

Done when:
1. Feedback and trait workflows pass existing smoke expectations.
2. Admin can complete style-dna flow: select influence -> copy prompts -> upload test grid -> view structured output.
3. No regression vs current `/v1` endpoint behavior.

## Phase U5: Admin + Contributor UI Essentials

Objective:
- Rebuild MVP admin/contributor controls needed for operations.

Tasks:
1. Admin style influence governance controls.
2. Admin moderation actions and audit visibility.
3. Admin prompt curation + approval policy views.
4. Admin user role management list/update views.
5. Contributor submission create/list/trigger/retry views.

Done when:
1. Admin/contributor critical operations are available in new UI.
2. Role-based access behavior is validated against API responses.

## Phase U6: Testing, Smoke Updates, and Cutover

Objective:
- Complete release-quality verification and switch default frontend.

Tasks:
1. Add targeted frontend tests for critical forms and auth transitions.
2. Update smoke scripts to target new UI routes/selectors.
3. Run launch readiness smoke + operational checks.
4. Switch `npm run frontend` to new app entrypoint.
5. Keep rollback switch to legacy frontend path for one release window.

Done when:
1. Launch checklist passes with new frontend.
2. Rollback procedure is documented and validated.

## Dependencies

1. Working Cognito configuration values for local/prod.
2. Stable `/v1` API contract behavior for all migrated flows.
3. Updated environment configuration docs for frontend runtime vars.

## Risks and Mitigations

1. Risk: Auth integration blocks UI progress.
Mitigation: complete U2 before deep flow migration; keep local-only dev auth override.

2. Risk: Migration churn breaks smoke automation.
Mitigation: update smoke scripts in parallel with each phase, not at the end.

3. Risk: UI parity misses edge-case error behavior.
Mitigation: reuse existing backend smoke fixtures and add negative-path UI checks.

4. Risk: Cutover causes launch instability.
Mitigation: one-release rollback path to legacy frontend with explicit switch procedure.

## Acceptance Criteria

1. New frontend stack matches documented decisions (Next.js/TypeScript/Tailwind/shadcn/TanStack Query).
2. Hosted UI sign-in is default flow for protected API access.
3. Recommendation, feedback, trait, admin, and contributor MVP flows are operational in new UI.
4. Existing backend API contracts remain unchanged and smoke-verified.
5. Launch checklist passes with new UI as default frontend.

## Rollout and Rollback

Rollout:
1. Deploy new frontend behind internal flag.
2. Execute full smoke suite and focused manual checks.
3. Enable new frontend as default entry.

Rollback:
1. Repoint frontend service/entry command to legacy implementation.
2. Re-run critical smoke checks.
3. Keep API/worker unchanged during rollback to reduce blast radius.

## Recommended Execution Order

1. U0 Decision/Contract Lock.
2. U1 Foundation Bootstrap.
3. U2 Auth Integration.
4. U3 Recommendation flow.
5. U4 Feedback + Trait flows.
6. U5 Admin + Contributor essentials.
7. U6 Testing + Cutover.
