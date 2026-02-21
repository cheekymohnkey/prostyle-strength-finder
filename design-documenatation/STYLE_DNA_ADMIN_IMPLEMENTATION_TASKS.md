# Prostyle Strength Finder - Style-DNA Admin Implementation Tasks

Status: Planned  
Date: 2026-02-21  
Depends on:
- `design-documenatation/DECISIONS.md`
- `design-documenatation/ARCHITECTURE_AND_ERD.md`
- `design-documenatation/TECHNICAL_DECISIONS.md`
- `design-documenatation/IMPLEMENTATION_PLAN.md`
- `design-documenatation/UI_UPGRADE_IMPLEMENTATION_PLAN.md`
- `design-documenatation/LLM_WORKFLOW.md`
- `design-documenatation/STYLE_DNA_ADMIN_IMPLEMENTATION_PLAN.md`

## Purpose

Translate the Style-DNA admin feature plan into executable tasks with clear sequencing, acceptance criteria, and verification commands.

## Objective

Ship an admin-only workflow that:
1. Reuses baseline grids by MidJourney model/version and fixed parameter envelope.
2. Lets admin select stored style influences (srefs/moodboards).
3. Generates copy-ready MidJourney prompts.
4. Accepts returned test grids and enqueues strict-schema analysis.
5. Persists raw and canonicalized trait outputs for retrieval and auditing.

## Scope

In scope:
1. Persistence and repository additions for baseline sets, prompt jobs, style-dna runs.
2. Admin API endpoints for baseline, prompt generation, and run execution.
3. Worker integration with strict structured LLM output contract.
4. Admin UI route for full operator workflow.
5. Smoke/integration verification and runbook updates.

Out of scope:
1. MidJourney rendering automation.
2. Public/non-admin style-dna execution surfaces.
3. Broad taxonomy governance redesign.

## Execution Sequence

1. SD1 Persistence + contracts foundation.
2. SD2 Admin API surface.
3. SD3 Worker + strict LLM integration.
4. SD4 Admin UI flow.
5. SD5 Verification and hardening.

## SD1. Persistence + Shared Contracts

Description:
- Add DB structures and shared payload validators needed by API/worker/frontend.

Implementation tasks:
1. Add migration(s) for:
- baseline prompt suites and items
- baseline render sets and items
- style-dna prompt jobs and items
- style-dna runs and results
2. Add indexes for hot queries:
- baseline set lookup by model/version + envelope hash
- prompt job lookup by style influence + created_at
- run status lookup by status + created_at
3. Add repository methods for create/get/list/update across all new entities.
4. Add shared validators in `packages/shared-contracts` for:
- baseline set create payload
- prompt job create payload
- style-dna run submit payload
- style-dna run result envelope

Acceptance criteria:
1. Migrations apply cleanly from zero and current repo state.
2. Repository methods support all SD2 endpoint use cases.
3. Invalid payloads fail with stable `api-error` contract shapes.

## SD2. Admin API Surface

Description:
- Implement admin endpoints for baseline lifecycle, prompt generation, and run execution.

Implementation tasks:
1. Baseline endpoints:
- `POST /v1/admin/style-dna/baseline-sets`
- `GET /v1/admin/style-dna/baseline-sets`
- `GET /v1/admin/style-dna/baseline-sets/:baselineRenderSetId`
- `POST /v1/admin/style-dna/baseline-sets/:baselineRenderSetId/items`
2. Prompt generation endpoints:
- `POST /v1/admin/style-dna/prompt-jobs`
- `GET /v1/admin/style-dna/prompt-jobs/:promptJobId`
3. Run endpoints:
- `POST /v1/admin/style-dna/runs`
- `GET /v1/admin/style-dna/runs`
- `GET /v1/admin/style-dna/runs/:styleDnaRunId`
4. Add admin-only RBAC checks and immutable audit writes.
5. Enforce compatibility checks:
- baseline model/version and envelope match
- required baseline prompt coverage exists
- selected style influence is eligible
6. Add idempotency-key handling for run submissions.

Acceptance criteria:
1. All endpoints are contract-validated and role-protected.
2. Non-admin calls return `403`.
3. Validation errors are explicit and actionable.
4. Run submission enqueues exactly one job per idempotency key.

## SD3. Worker + Strict LLM Schema Path

Description:
- Wire queue jobs to strict-schema LLM analysis and result persistence.

Implementation tasks:
1. Add queue job envelope type for style-dna runs.
2. Load prompt text from versioned file at runtime.
3. Call OpenAI using strict schema response format:
- `response_format.type = json_schema`
- `strict = true`
4. Validate returned payload against shared schema.
5. Persist:
- raw provider JSON
- normalized atomic traits
- canonical mapped traits + taxonomy version
6. Add retry policy handling:
- retry transient provider failures
- dead-letter after max attempts
- mark non-retryable validation failures explicitly
7. Emit structured logs with style-dna correlation IDs.

Acceptance criteria:
1. Happy path reaches `succeeded` with persisted result payloads.
2. Invalid schema response path is handled deterministically.
3. Retry/dead-letter behavior is observable and auditable.

## SD4. Admin UI Route and Workflow

Description:
- Build `/admin/style-dna` with operator-friendly flow and strict gating.

Implementation tasks:
1. Add admin-only route and access guard.
2. Implement baseline set selector:
- model/version
- prompt suite version
- coverage/completeness indicator
3. Implement style influence picker using stored system records.
4. Implement prompt generation panel with copy-ready blocks.
5. Implement test grid intake per prompt key/tier and run submission.
6. Implement status and results panels:
- queued/in_progress/succeeded/failed states
- structured trait categories
7. Implement explicit error states for mismatch and missing prerequisites.

Acceptance criteria:
1. Admin can execute the full workflow in UI without manual API calls.
2. Submit actions are disabled until prerequisites are satisfied.
3. Results are rendered consistently with API schema.

## SD5. Verification, Smokes, and Runbook

Description:
- Add repeatable verification coverage and document operation commands.

Implementation tasks:
1. Add smoke scripts:
- `npm run style-dna:baseline-smoke`
- `npm run style-dna:prompt-generation-smoke`
- `npm run style-dna:run-smoke`
- `npm run style-dna:schema-failure-smoke`
2. Add focused integration tests for:
- baseline compatibility checks
- RBAC enforcement
- idempotency behavior
- run lifecycle transitions
3. Add README runbook section for style-dna admin flow.
4. Add launch/readiness gate hook to include style-dna smokes when enabled.

Acceptance criteria:
1. Smoke scripts run from clean state and return `ok: true`.
2. Failure-path smoke proves strict-schema invalid responses are handled safely.
3. Existing critical smokes remain green (no regressions).

## Suggested Ticket Breakdown

1. `SDNA-01` migrations + repository foundation.
2. `SDNA-02` shared contracts and validators.
3. `SDNA-03` baseline set admin endpoints + audit.
4. `SDNA-04` prompt generation service + endpoints.
5. `SDNA-05` style-dna run submit/list/get endpoints + queue enqueue.
6. `SDNA-06` worker strict schema integration.
7. `SDNA-07` taxonomy mapping persistence path.
8. `SDNA-08` admin UI route + baseline/influence selectors.
9. `SDNA-09` prompt copy UX + test grid upload/submit.
10. `SDNA-10` status/results panel rendering.
11. `SDNA-11` smoke scripts and integration tests.
12. `SDNA-12` docs/runbook and launch gate updates.

## Verification Runbook (Target End-State)

1. `npm run contracts`
2. `set -a; source .env.local.example; set +a`
3. `npm run db:reset`
4. `npm run style-dna:baseline-smoke`
5. `npm run style-dna:prompt-generation-smoke`
6. `npm run style-dna:run-smoke`
7. `npm run style-dna:schema-failure-smoke`
8. Existing regression checks:
- `npm run admin:governance-smoke`
- `npm run admin:role-management-smoke`
- `npm run recommendation:smoke`

Expected:
1. All style-dna smokes return `ok: true`.
2. Role-boundary checks return stable `403`.
3. Schema-failure smoke verifies safe failure + retry/dead-letter behavior.

## Risks and Controls

1. Risk: Baseline misuse due to compatibility mismatch.
Control: strict model/version + envelope hash validation and UI indicators.

2. Risk: JSON schema drift causes worker breakage.
Control: shared schema constants + strict provider format + schema-failure smoke.

3. Risk: Prompt generation inconsistency.
Control: deterministic template service + golden-file tests for generated lines.

4. Risk: Admin workflow complexity slows operations.
Control: staged UI with completeness signals and copy-first UX.

## Definition of Done

1. Admin can select a stored style influence and generate copy-ready prompts.
2. Baseline set reuse works correctly and blocks incompatible comparisons.
3. Admin can submit test grids and receive structured style-dna results.
4. Strict-schema parsing is enforced end-to-end (no fallback free-text parsing).
5. Smoke suite verifies happy path and critical failure paths.
