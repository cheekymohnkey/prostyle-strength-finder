# Prostyle Strength Finder - Epic D Implementation Tasks

Status: Complete (D1-D8 completed)  
Date: 2026-02-20  
Depends on:
- `design-documenatation/DECISIONS.md`
- `design-documenatation/USER_NEEDS_ANALYSIS.md`
- `design-documenatation/ARCHITECTURE_AND_ERD.md`
- `design-documenatation/TECHNICAL_DECISIONS.md`
- `design-documenatation/MVP_PATH.md`
- `design-documenatation/IMPLEMENTATION_PLAN.md`
- `design-documenatation/EPIC_A_IMPLEMENTATION_TASKS.md`
- `design-documenatation/EPIC_B_IMPLEMENTATION_TASKS.md`
- `design-documenatation/EPIC_C_IMPLEMENTATION_TASKS.md`

## Purpose

Translate Epic D (MVP-3 Admin + Contributor Essentials) into executable engineering tasks with clear acceptance criteria, sequencing, and handoff context.

## Current Entry Snapshot (2026-02-20)

1. Epic A platform foundation is complete.
2. Epic B recommendation flow is implemented and smoke-verified.
3. Epic C feedback loop is implemented and smoke-verified.
4. Epic D is the next execution focus to deliver governance, moderation, contributor operations, and auditable controls.

## Current Execution Snapshot (2026-02-20 D1-D7 Wrap)

1. What was completed:
- D1-D3 governance foundation is implemented:
  - shared validators in `packages/shared-contracts/src/admin-governance.js`
  - persistence/audit foundation in `scripts/db/migrations/20260219194000_epic_d_admin_foundation.sql`
  - governance endpoints:
    - `POST /v1/admin/style-influences/:styleInfluenceId/governance`
    - `GET /v1/admin/style-influences/:styleInfluenceId/audit`
  - smoke script:
    - `scripts/admin/governance-smoke.js`
    - `npm run admin:governance-smoke`
- D4 analysis moderation is implemented:
  - migration `scripts/db/migrations/20260219213000_epic_d_analysis_moderation.sql`
  - moderation endpoints:
    - `POST /v1/admin/analysis-jobs/:jobId/moderation`
    - `GET /v1/admin/analysis-jobs/:jobId/moderation`
  - moderation smoke:
    - `scripts/admin/moderation-smoke.js`
    - `npm run admin:moderation-smoke`
- D5 prompt curation states are implemented:
  - migration `scripts/db/migrations/20260219230000_epic_d_prompt_curation.sql`
  - prompt curation endpoints:
    - `POST /v1/admin/prompts/:promptId/curation`
    - `GET /v1/admin/prompts/:promptId/curation`
  - prompt curation smoke:
    - `scripts/admin/prompt-curation-smoke.js`
    - `npm run admin:prompt-curation-smoke`
- D6 approval policy controls are implemented:
  - migration `scripts/db/migrations/20260220000500_epic_d_approval_policy.sql`
  - approval policy endpoints:
    - `GET /v1/admin/approval-policy`
    - `POST /v1/admin/approval-policy`
  - manual approval endpoints:
    - `GET /v1/admin/analysis-jobs/:jobId/approval`
    - `POST /v1/admin/analysis-jobs/:jobId/approval`
  - approval policy smoke:
    - `scripts/admin/approval-policy-smoke.js`
    - `npm run admin:approval-policy-smoke`
- D7 contributor essentials are implemented:
  - migration `scripts/db/migrations/20260220113000_epic_d_contributor_essentials.sql`
  - shared contributor validators in:
    - `packages/shared-contracts/src/contributor-essentials.js`
  - contributor endpoints:
    - `POST /v1/contributor/submissions`
    - `GET /v1/contributor/submissions`
    - `POST /v1/contributor/submissions/:submissionId/trigger`
    - `GET /v1/contributor/submissions/:submissionId`
    - `POST /v1/contributor/submissions/:submissionId/retry`
  - contributor smoke:
    - `scripts/contributor/essentials-smoke.js`
    - `npm run contributor:essentials-smoke`
- D8 verification + handoff artifacts are implemented:
  - minimal frontend critical-flow proxy smoke:
    - `scripts/admin/frontend-proxy-smoke.js`
    - `npm run admin:frontend-proxy-smoke`
  - handoff artifact:
    - `design-documenatation/EPIC_D_D8_HANDOVER.md`
- README runbook includes Epic D admin smoke commands and endpoint references.

2. Verification run:
- `npm run contracts`
- `set -a; source .env.local.example; set +a`
- `npm run db:reset`
- `npm run admin:governance-smoke`
- `npm run admin:moderation-smoke`
- `npm run admin:prompt-curation-smoke`
- `npm run admin:approval-policy-smoke`
- `npm run contributor:essentials-smoke`
- `npm run admin:frontend-proxy-smoke`
- Result: all Epic D admin smokes return `ok: true`, including:
  - `403` role-boundary rejection checks
  - audit creation checks for high-impact actions
  - moderation rerun enqueue and status transitions
  - prompt curation status transitions and active-prompt preference
  - approval policy default (`auto-approve`) and manual-mode gating (`pending_approval`)
  - contributor ownership/role boundaries and retry flow checks

3. Outstanding risks/issues:
- Role assignment currently defaults first-seen users to `consumer`; no admin role-management UI/API yet.
- Cache invalidation currently uses a placeholder hook (no in-process cache registry wired yet).
- Epic D closeout verification/handoff package (D8) is not yet completed.

4. Recommended next task:
- Start Epic E hardening follow-ups (role-management tooling, real cache invalidation, contributor/admin UX expansion).

## Epic D - Admin + Contributor Essentials (MVP-3)

Objective:
- Enable operational governance and contributor workflows needed to run recommendations safely in MVP.

### Scope

1. Admin moderation actions (flag/remove/re-run).
2. Style influence governance (disable/pin/unpin/remove).
3. Prompt curation states (`active`, `deprecated`, `experimental`).
4. Approval mode control (`auto-approve` default, `manual` available).
5. Contributor upload/add/trigger status and retry flows.
6. Basic audit trail for high-impact admin actions.

### Out of Scope

1. Full analytics dashboards and long-horizon trend reporting.
2. Broad multi-tenant policy engines.
3. Advanced moderation automation/ML classifiers.
4. Post-MVP operational hardening in Epic E (backup drills, broad observability expansion).

### Constraints

1. High-impact admin actions must be auditable.
2. Governance writes must invalidate caches affecting recommendation selection/ranking.
3. Disabled influences must be excluded from default recommendation candidates.
4. Authorization must enforce role boundaries (`admin`, `contributor`, `consumer`).
5. Queue failure recovery actions must avoid manual DB edits.

## Recommended First Slice

1. D1 contracts + D2 persistence/repository + D3 governance endpoints.
2. Goal: ship admin-only profile/sref governance (`disable`, `pin`, `unpin`, `remove`) with immutable audit records and recommendation-impact verification.
3. Why first:
- Delivers highest-leverage governance control from `USER_NEEDS_ANALYSIS.md` AT-2 and AT-6.
- Uses existing ranking behavior that already reads pinned/active influence data.
- Creates reusable audit and authorization patterns for remaining Epic D tasks.

## Task Breakdown

## D1. Governance/Moderation Shared Contracts

Description:
- Define request/response contracts for admin and contributor operations in shared contracts.

Implementation tasks:
1. Add payload validators for:
- style influence governance actions
- analysis moderation actions
- prompt curation actions
- approval mode updates
- contributor retry actions
2. Add stable response shapes for audit references and action results.
3. Add validation-backed error behavior using shared `api-error` conventions.

Acceptance criteria:
1. API endpoints for Epic D consume shared contract validators.
2. Invalid payloads return stable `api-error` responses.
3. Contract exports are versioned and reusable by frontend.

## D2. Persistence and Audit Foundations

Description:
- Implement relational persistence needed for governance state and action traceability.

Implementation tasks:
1. Add migration(s) for missing Epic D entities (including `admin_actions_audit` if not yet present).
2. Add indexes for hot lookups:
- audit by `created_at`
- audit by `target_type` + `target_id`
- operational status lookups used by moderation/retry flows
3. Add repository methods for:
- governance state updates
- moderation updates
- prompt curation updates
- approval mode reads/writes
- immutable audit inserts + retrieval

Acceptance criteria:
1. Migrations apply from zero and existing Epic C state.
2. High-impact actions write immutable audit records.
3. Repository query paths support admin operational views without raw SQL in handlers.

## D3. Admin Style Influence Governance

Description:
- Expose admin controls for profile/sref governance actions.

Implementation tasks:
1. Add admin endpoints for `disable`, `pin`, `unpin`, `remove` on style influences.
2. Enforce admin-only role checks and stable `403` behavior.
3. Persist audit entries for every governance action (actor, action, target, reason, timestamp).
4. Invalidate recommendation-relevant caches on governance writes.

Acceptance criteria:
1. Disabled influences are excluded from default recommendation paths.
2. Pinned/unpinned actions affect ranking behavior where applicable.
3. Governance actions are reversible where required.
4. Every governance action is auditable.

## D4. Admin Analysis Moderation (Flag/Remove/Re-run)

Description:
- Enable moderation of problematic analysis outputs and controlled reruns.

Implementation tasks:
1. Add admin endpoints for analysis moderation actions (`flag`, `remove`, `re-run`).
2. Implement rerun enqueue path via queue adapter with idempotency safeguards.
3. Expose run/retry status for moderated items.
4. Persist audit records for moderation actions.

Acceptance criteria:
1. Removed/flagged analyses no longer affect active recommendation surfaces.
2. Rerun action enqueues and status is visible until completion/failure.
3. Unauthorized moderation calls are rejected.

## D5. Prompt Curation States

Description:
- Add admin prompt catalog controls for trust/reliability management.

Implementation tasks:
1. Add admin endpoints to set prompt status (`active`, `deprecated`, `experimental`).
2. Ensure default recommendation/retrieval paths prefer active prompts.
3. Record version/state transitions for traceability.
4. Persist audit records for prompt governance changes.

Acceptance criteria:
1. Deprecated prompts are not used by default selection paths.
2. Prompt state is queryable and explicit.
3. Prompt state changes are fully auditable.

## D6. Approval Policy Controls

Description:
- Implement configurable approval mode behavior for incoming analyses.

Implementation tasks:
1. Add policy persistence and retrieval for approval mode (`auto-approve`, `manual`).
2. Route incoming analyses through mode-aware state transitions.
3. Add admin endpoint(s) to update/read current policy state.
4. Ensure policy updates are visible immediately and auditable.

Acceptance criteria:
1. System defaults to `auto-approve`.
2. `manual` mode can be enabled without workflow redesign.
3. Policy state is visible to admin at all times.

## D7. Contributor Essentials (Upload/Add/Status/Retry)

Description:
- Provide contributor-first operations with role-appropriate boundaries.

Implementation tasks:
1. Add contributor path to upload/add profile-sref entries.
2. Add trigger-analysis action for contributor-owned entries.
3. Add status view for in-progress/failed/succeeded analysis processing.
4. Add retry action for contributor-owned failed submissions.
5. Enforce ownership and role constraints for contributor actions.

Acceptance criteria:
1. Contributor can add and iterate without admin intervention for normal cases.
2. Contributor can retry own failed submissions.
3. Contributor cannot access admin-only governance/moderation controls.

## D8. Verification and Handoff

Description:
- Validate Epic D done criteria and produce reproducible handoff artifacts.

Implementation tasks:
1. Add backend smoke checks for:
- governance action effects on recommendation behavior
- moderation rerun path
- approval mode toggling behavior
- contributor ownership/role boundaries
- audit record creation for high-impact actions
2. Add minimal frontend checks for admin/contributor critical flows.
3. Document reproducible commands in `README.md`.
4. Capture residual follow-ups for Epic E.

Acceptance criteria:
1. Epic D done criteria are demonstrably met.
2. Smoke checks are reproducible from clean checkout.
3. Residual risks and follow-ups are explicit.

## Epic D Done Checklist

1. Admin can moderate analysis outcomes (`flag`, `remove`, `re-run`).
2. Admin can govern style influences (`disable`, `pin`, `unpin`, `remove`).
3. Admin can curate prompts with clear status transitions.
4. Approval mode policy is configurable and visible.
5. Contributor can submit, monitor, and retry own submissions.
6. Governance/moderation writes invalidate recommendation-relevant caches.
7. High-impact admin actions are auditable with immutable records.

## Suggested Execution Sequence

1. D1 Governance/Moderation Shared Contracts
2. D2 Persistence and Audit Foundations
3. D3 Admin Style Influence Governance
4. D4 Admin Analysis Moderation (Flag/Remove/Re-run)
5. D5 Prompt Curation States
6. D6 Approval Policy Controls
7. D7 Contributor Essentials (Upload/Add/Status/Retry)
8. D8 Verification and Handoff

## Risks and Controls

1. Risk: Governance actions accidentally impact recommendation quality broadly.  
Control: reversible actions, cache invalidation, and targeted smoke tests on recommendation effects.

2. Risk: Missing/partial audit coverage for high-impact actions.  
Control: centralized audit write path in repository/service layer and verification checks per endpoint.

3. Risk: Role-boundary regressions expose admin actions to non-admin users.  
Control: explicit role middleware checks and endpoint-level forbidden-path tests.

4. Risk: Manual approval mode introduces processing bottlenecks.  
Control: keep `auto-approve` default and validate operational behavior before expanding manual workflows.
