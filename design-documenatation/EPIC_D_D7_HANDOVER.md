# Epic D D7 Handover (Contributor Essentials)

Date: 2026-02-20  
Scope: Prepare the next execution slice for `D7. Contributor Essentials (Upload/Add/Status/Retry)`.

## Current State (Completed Before D7)

1. D1-D6 are implemented and pushed to `origin/master`.
2. Admin capabilities implemented:
- governance (`/v1/admin/style-influences/...`)
- moderation (`/v1/admin/analysis-jobs/.../moderation`)
- prompt curation (`/v1/admin/prompts/.../curation`)
- approval policy + manual approval (`/v1/admin/approval-policy`, `/v1/admin/analysis-jobs/.../approval`)
3. Smoke commands in place:
- `npm run admin:governance-smoke`
- `npm run admin:moderation-smoke`
- `npm run admin:prompt-curation-smoke`
- `npm run admin:approval-policy-smoke`

## D7 Objective

Deliver contributor-first operations that allow normal iteration without admin intervention while preserving role and ownership boundaries.

## D7 Required Outcomes

1. Contributor can add/upload profile-sref entries.
2. Contributor can trigger analysis for contributor-owned entries.
3. Contributor can view status for in-progress/failed/succeeded analysis.
4. Contributor can retry own failed submissions.
5. Contributor cannot access admin-only endpoints.

## Guardrails

1. Enforce role boundaries (`admin`, `contributor`, `consumer`) at endpoint level.
2. Enforce ownership checks on contributor resources and retry actions.
3. Persist auditable records where actions are high-impact.
4. Avoid manual DB edits for recovery paths; use API flows.

## Recommended First D7 Slice

1. Add contributor-owned submission entity linkage (owner user id).
2. Add contributor endpoints:
- create/add submission
- trigger analysis
- get submission status
- retry failed submission
3. Implement authorization checks:
- `403` for non-contributor/foreign-owner operations
4. Add smoke script:
- contributor happy path (create -> trigger -> status -> retry failed)
- forbidden path checks

## Suggested API Shape (D7)

1. `POST /v1/contributor/submissions`
2. `POST /v1/contributor/submissions/:submissionId/trigger`
3. `GET /v1/contributor/submissions/:submissionId`
4. `POST /v1/contributor/submissions/:submissionId/retry`

Note: endpoint names can be adjusted; preserve single-resource ownership semantics.

## Verification Runbook for D7

1. `npm run contracts`
2. `set -a; source .env.local.example; set +a`
3. `npm run db:reset`
4. `npm run admin:governance-smoke`
5. `npm run admin:moderation-smoke`
6. `npm run admin:prompt-curation-smoke`
7. `npm run admin:approval-policy-smoke`
8. `npm run contributor:essentials-smoke` (to be added in D7)

## Open Risks to Track During D7

1. Default-role assignment still seeds first-seen users as `consumer`.
2. Cache invalidation is still placeholder-only in admin governance path.
3. Contributor entity modeling choices can impact D8 verification complexity.

## Next Task Start Template

Use these docs as source of truth:
- `design-documenatation/DECISIONS.md`
- `design-documenatation/ARCHITECTURE_AND_ERD.md`
- `design-documenatation/TECHNICAL_DECISIONS.md`
- `design-documenatation/MVP_PATH.md`
- `design-documenatation/IMPLEMENTATION_PLAN.md`
- `design-documenatation/EPIC_D_IMPLEMENTATION_TASKS.md`
- `design-documenatation/EPIC_D_D7_HANDOVER.md`

Task objective:
- Implement Epic D7 contributor essentials with ownership enforcement and smoke coverage.
