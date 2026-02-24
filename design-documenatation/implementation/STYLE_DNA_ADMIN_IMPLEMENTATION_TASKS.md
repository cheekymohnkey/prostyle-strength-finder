# Prostyle Strength Finder - Style-DNA Admin Implementation Tasks

Status: In Progress  
Date: 2026-02-22  
Depends on:
- `design-documenatation/DECISIONS.md`
- `design-documenatation/ARCHITECTURE_AND_ERD.md`
- `design-documenatation/TECHNICAL_DECISIONS.md`
- `design-documenatation/implementation/IMPLEMENTATION_PLAN.md`
- `design-documenatation/implementation/UI_UPGRADE_IMPLEMENTATION_PLAN.md`
- `design-documenatation/LLM_WORKFLOW.md`
- `design-documenatation/implementation/STYLE_DNA_ADMIN_IMPLEMENTATION_PLAN.md`

## Purpose

Translate the Style-DNA admin feature plan into executable tasks with clear sequencing, acceptance criteria, and verification commands.

## Objective

Ship an admin-only workflow that:
1. Reuses baseline grids by MidJourney model/version and fixed parameter envelope.
2. Lets admin select stored style influences (srefs/moodboards).
3. Generates copy-ready MidJourney prompts.
4. Accepts returned test grids and enqueues strict-schema analysis.
5. Persists raw and canonicalized trait outputs for retrieval and auditing.
6. Enforces sref control-policy baselines so deltas are measured against `--sw 0` controls at the same stylize tier.

## Explicit Use Case Split

1. Use Case 1: Baseline test definition management.
2. Use Case 2: Baseline output grid upload and storage.
3. Use Case 3: Style adjustment (`sref|profile`) comparison run against stored baseline.

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

## Current Execution Snapshot (2026-02-24)

1. SD1: Implemented.
- style-dna persistence migrations are present and applied in smoke runs.
- repository methods for baseline/prompt/run/image/result entities are in place.
- baseline prompt metadata persistence support is in place.
2. SD2: Partially implemented.
- baseline, prompt-job, run, and image endpoints are implemented with admin RBAC.
- idempotency behavior is implemented for run submission.
- server-side matched-control (`--sw 0`) gating for sref policy is now enforced at run submission (`styleWeight=0` control baseline requirement).
- run submission contract now includes `submittedTestEnvelope` and server-side locked-envelope parity checks.
- canonical trait governance endpoints are now implemented (`canonical-traits` list/create/status + `trait-aliases` list/create).
3. SD3: Implemented (DISC-002 foundation now in place).
- worker style-dna branch with strict-schema adapter and deterministic/openai modes is active.
- canonicalization pipeline now persists canonicalized traits, alias auto-merges, and unresolved discovery queue entries.
- canonicalization semantic matching now supports OpenAI embeddings (`/embeddings`) with `auto` fallback to proxy similarity when embeddings are unavailable.
- failure path reaches dead-letter behavior in schema-failure smoke.
4. SD4: Implemented (with polish remaining).
- `/admin/style-dna` supports baseline setup, image intake, prompt copy/generation, submit, and result lookup.
- loaded baseline sets can be used as editable drafts and saved as new baseline sets.
- run-submit guardrails now block and explain: stylize-tier mismatch, missing prompt+tier baseline coverage, sref control baseline requirements (`styleWeight=0`), and section-1 envelope drift vs loaded set.
- trait-discovery review queue and status-filtered review history are now available in Section 3.
- remaining: minor visual/layout tuning only.
5. SD5: Mostly implemented.
- style-dna smoke scripts exist and have passed in prior session verification.
- `style-dna:canonicalization-smoke` is implemented and passing.
- `style-dna:canonicalization-semantic-smoke` is implemented and passing (`proxy` vs `embedding` vs `auto` fallback coverage).
- `style-dna:canonical-governance-smoke` is implemented and passing (canonical create/dedupe, alias create/list, status deprecate, RBAC).
- `admin:frontend-proxy-smoke` now also validates canonical governance proxy flows (canonical create/dedupe/status, alias create/list, contributor `403` guardrail).
- prompt generation verification includes model version flag emission (`--v`).
- set-producing style-dna smokes now clean up smoke-created baseline suites/sets/items, prompt jobs/items, runs/results, and smoke images after successful verification.
- launch/readiness gate integration includes full style-dna smoke set (`tier-validation`, `baseline`, `prompt-generation`, `run`, `schema-failure`) in `launch:readiness-smoke` full scope.
- style-dna run smoke now explicitly verifies idempotent run-submit behavior (same idempotency key returns deduplicated existing run id).
- style-dna run smoke now explicitly verifies locked-envelope mismatch rejection at run submit.
- style-dna run smoke now explicitly verifies admin RBAC on run submit/list/get (`403 FORBIDDEN` for contributor token).
- style-dna run smoke now captures lifecycle progression evidence (pre-worker `queued`, terminal `succeeded` with result).
- schema-failure smoke fixture now explicitly sets control-baseline envelope (`styleWeight=0`) so the failure-path test remains compatible with enforced sref guardrails.
- full `launch:readiness-smoke` scope is currently passing after the schema-failure fixture fix.

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
7. Enforce and surface control-baseline policy for sref runs:
- comparisons require baseline coverage produced under `--sw 0`
- baseline and test must match stylize tier (`s`) and locked envelope fields

Acceptance criteria:
1. All endpoints are contract-validated and role-protected.
2. Non-admin calls return `403`.
3. Validation errors are explicit and actionable.
4. Run submission enqueues exactly one job per idempotency key.
5. [Done] sref comparisons are rejected when matched control baseline (`sw=0` at same `s`) is missing.

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
6. Implement canonicalization pipeline:
- normalize phrase (`lowercase`, trim, separator normalization, spacing collapse, safe singularization)
- resolve by exact canonical match, alias match, normalized match
- run embedding-assisted candidate lookup when deterministic resolution fails
- enforce threshold-gated auto-merge policy before canonical assignment
- persist unresolved traits as discovery candidates with similarity evidence for review
7. Add retry policy handling:
- retry transient provider failures
- dead-letter after max attempts
- mark non-retryable validation failures explicitly
8. Emit structured logs with style-dna correlation IDs.

Acceptance criteria:
1. Happy path reaches `succeeded` with persisted result payloads.
2. Invalid schema response path is handled deterministically.
3. Retry/dead-letter behavior is observable and auditable.
4. Ambiguous trait variants are review-gated and do not silently create canonical duplicates.

## SD4. Admin UI Route and Workflow

Description:
- Build `/admin/style-dna` with operator-friendly flow and strict gating.

Implementation tasks:
1. Add admin-only route and access guard.
2. Implement Use Case 1 UI: baseline test definition management:
- model/version
- prompt suite version
- coverage/completeness indicator
3. Implement Use Case 2 UI: baseline output upload + baseline set item attachment per prompt key/tier.
4. Implement Use Case 3 UI: style adjustment selector:
- adjustment type (`sref|profile`)
- MidJourney adjustment ID
- prompt generation panel with copy-ready blocks
- test grid intake + run submission
5. Implement status and results panels:
- queued/in_progress/succeeded/failed states
- structured trait categories
6. Implement explicit error states for mismatch and missing prerequisites.
7. Add admin review surface for unresolved trait candidates:
- list unresolved traits and top canonical candidates with similarity evidence
- approve alias merge or keep as distinct canonical trait per governance action

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
2. Extend style-dna smoke design coverage for sref matrix:
- control pair: `sw=0` at `s=0` and `s=100`
- functional pair: `sw=1000` at `s=0` and `s=100`
- optional stress pair: `sw=1000` at `s=1000`
3. Add focused integration tests for:
- matched-control gating (`sw=0`, same `s`)
- RBAC enforcement
- idempotency behavior
- run lifecycle transitions
4. Add canonicalization tests for:
- deterministic normalization/match behavior
- threshold-gated auto-merge allow/deny cases
- unresolved-trait review routing
- taxonomy-version audit persistence
5. Add README runbook section for style-dna admin flow.
6. Add launch/readiness gate hook to include style-dna smokes when enabled.

Acceptance criteria:
1. Smoke scripts run from clean state and return `ok: true`.
2. Failure-path smoke proves strict-schema invalid responses are handled safely.
3. Existing critical smokes remain green (no regressions).
4. Prompt-generation smoke verifies deterministic prompt blocks for selected `sw`/`s` matrix tiers.
5. Set-producing smoke scripts do not leave residual baseline test data after successful execution.
6. Canonicalization smoke verifies synonym squashing and review-gated unresolved trait behavior.

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
Also require matched control baseline policy (`sw=0` at same stylize tier).

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
