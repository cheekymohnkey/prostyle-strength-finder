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
- canonical trait governance endpoints are now implemented (`canonical-traits` list/create/status + `trait-aliases` list/create/status).
- taxonomy seed endpoint is now implemented (`POST /v1/admin/style-dna/taxonomy-seed`) with idempotent apply, deprecated-status reactivation, and conflict reporting.
3. SD3: Implemented (DISC-002 foundation now in place).
- worker style-dna branch with strict-schema adapter and deterministic/openai modes is active.
- canonicalization pipeline now persists canonicalized traits, alias auto-merges, and unresolved discovery queue entries.
- canonicalization semantic matching now supports OpenAI embeddings (`/embeddings`) with `auto` fallback to proxy similarity when embeddings are unavailable.
- failure path reaches dead-letter behavior in schema-failure smoke.
4. SD4: Implemented and Polished (SDNA-08, SDNA-09 completed).
- `/admin/style-dna` supports baseline setup, image intake, prompt copy/generation, submit, and result lookup.
- Studio layout implemented: Global Context Bar, Two-Column Workflow, Drag-and-Drop + URL-Drop uploads (Baseline & Test grids).
- Image uploads utilize JSON/Base64 persistence path to bypass proxy multipart limitations.
- loaded baseline sets can be used as editable drafts and saved as new baseline sets.
- run-submit guardrails now block and explain: stylize-tier mismatch, missing prompt+tier baseline coverage, sref control baseline requirements (`styleWeight=0`), and section-1 envelope drift vs loaded set.
- trait-discovery review queue and status-filtered review history are now available in Section 3.
- canonical trait library UI now supports alias status filtering and alias deprecate/reactivate actions.
- Studio now supports in-place Style Influence creation (sref/profile) via modal; newly created influences auto-select and refresh the selector list.
- SDNA-10 status/results rendering is now substantially implemented in Studio:
	- run operations log supports selectable rows with newest-first ordering.
	- run operations log now supports status filtering, fetch limit control, and pagination controls.
	- selected run detail renders lookup payload inline (`vibeShift`, `dominantDnaTags`, `deltaStrength`) and includes aggregated summary signal when available.
	- selected run has a detail drawer/modal with diagnostics: status metadata, error code/message, payload context, and baseline/test image links.
	- standalone “Results & History” block was consolidated into run operations detail to reduce split context.
- baseline replacement UX now supports existing-image replacement via click, paste, and drag/drop directly on the baseline card.
- React Query v5 mutation state compatibility fix applied (`isLoading` -> `isPending`) for new-influence flow.
5. SD5: Mostly implemented.
- style-dna smoke scripts exist and have passed in prior session verification.
- `style-dna:canonicalization-smoke` is implemented and passing.
- `style-dna:canonicalization-semantic-smoke` is implemented and passing (`proxy` vs `embedding` vs `auto` fallback coverage).
- `style-dna:canonical-governance-smoke` is implemented and passing (canonical create/dedupe, alias create/list, status deprecate, RBAC).
- `style-dna:taxonomy-seed-smoke` is implemented and passing (seed idempotency + deprecate/reactivate replay behavior).
- `style-dna:taxonomy-seed-library-smoke` is implemented and passing (versioned seed library batch import idempotency).
- `style-dna:taxonomy-seed-diff-smoke` is implemented and passing (deterministic diff report + conflict/reactivation visibility).
- `style-dna:taxonomy-seed-coverage-smoke` is implemented and passing (per-axis coverage pass/fail with explicit deficits).
- `style-dna:taxonomy-seed-apply-coverage-smoke` is implemented and passing (apply flow coverage gate blocks writes on under-covered bundles).
- `style-dna:taxonomy-seed-v2-rollout-smoke` is implemented and passing (v2 coverage, idempotent apply, zero-gap diff, and v1+v2 coexistence).
- `style-dna:taxonomy-seed-rollout-artifacts-smoke` is implemented and passing (standardized rollout artifact generation and blocked-run behavior checks).
- `style-dna:taxonomy-seed-rollout-artifacts-index-prune-smoke` is implemented and passing (deterministic artifact indexing and safe keep-count pruning).
- `style-dna:taxonomy-seed-rollout-artifacts-export-smoke` is implemented and passing (selected-run and latest-by-taxonomy export with manifest + missing-run guardrails).
- `style-dna:taxonomy-seed-rollout-artifacts-upload-smoke` is implemented and passing (manifest-driven upload receipt determinism + missing-source failure path + publish wrapper).
- `style-dna:taxonomy-seed-rollout-artifacts-upload-ci` is implemented and passing (CI wrapper with isolated/shared storage-policy execution modes and shared-env contract checks).
- `style-dna:discovery-review-replay-smoke` is implemented and passing (review transition conflict handling + alias replay resolution behavior).
- `admin:frontend-proxy-smoke` now also validates canonical governance proxy flows (canonical create/dedupe/status, alias create/list, contributor `403` guardrail).
- prompt generation verification includes model version flag emission (`--v`).
- set-producing style-dna smokes now clean up smoke-created baseline suites/sets/items, prompt jobs/items, runs/results, and smoke images after successful verification.
- launch/readiness gate integration includes full style-dna smoke set (`tier-validation`, `taxonomy-seed-coverage`, `taxonomy-seed-rollout-artifacts-upload`, `baseline`, `prompt-generation`, `run`, `schema-failure`) in `launch:readiness-smoke` full scope.
- style-dna run smoke now explicitly verifies idempotent run-submit behavior (same idempotency key returns deduplicated existing run id).
- style-dna run smoke now explicitly verifies locked-envelope mismatch rejection at run submit.
- style-dna run smoke now explicitly verifies admin RBAC on run submit/list/get (`403 FORBIDDEN` for contributor token).
- style-dna run smoke now captures lifecycle progression evidence (pre-worker `queued`, terminal `succeeded` with result).
- schema-failure smoke fixture now explicitly sets control-baseline envelope (`styleWeight=0`) so the failure-path test remains compatible with enforced sref guardrails.
- full `launch:readiness-smoke` scope is currently passing after the schema-failure fixture fix.
- `admin:frontend-proxy-smoke` now additionally validates run-operations contracts used by Studio UX:
	- runs list `status` filter semantics (`queued`)
	- runs list `limit` behavior and invalid limit rejection (`400 INVALID_REQUEST`)
	- run lookup diagnostics field presence required by run-detail modal

### SD4 open follow-up (recommended next slice)
1. [Done] Retry safety hardening in run operations UI:
- retry submit now disables when required references are missing (test/baseline/context prerequisites)
- explicit disable reason/tooltips are surfaced on retry actions
- valid retry path remains unchanged
2. [Done] Browser-level run-operations UI automation (Playwright):
- deterministic fixture seeding added for run-ops interactions (`tests/playwright/setup/seed-style-dna-run-ops.js`)
- run-ops interaction spec added and stabilized (`tests/playwright/style-dna-run-ops.spec.ts`)
- Playwright scripts now seed fixture before execution (`package.json` `e2e:playwright*` scripts)
- merged to `master` on 2026-02-28 and verified post-merge (`e2e:playwright` + `admin:frontend-proxy-smoke` pass)
3. Next recommended slice:
- expand Playwright coverage to include retry disable-reason visibility and run filter/limit/paging edge interactions

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
- `DELETE /v1/admin/style-dna/baseline-sets/:baselineRenderSetId`
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
8. Baseline-set delete shall perform deterministic cascade cleanup for baseline-linked records:
- prompt jobs/items
- style-dna runs/results
- related analysis runs/jobs and image trait analyses
- unreferenced style-dna image records (and storage object cleanup best-effort)

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
13. `SDNA-13` taxonomy seeding + replay-safety tests (`DISC-002` completion).
14. `SDNA-14` versioned taxonomy seed library + import tooling.
15. `SDNA-15` taxonomy diff/report tooling for governance preview.
16. `SDNA-16` taxonomy seed per-axis coverage validation tooling.
17. `SDNA-17` coverage-gated seed apply enforcement + readiness integration.
18. `SDNA-18` expanded v2 seed bundle + versioned rollout workflow.
19. `SDNA-19` consolidated rollout artifact generation + naming standards.
20. `SDNA-20` artifact index + prune tooling.
21. `SDNA-21` artifact export + manifest tooling.
22. `SDNA-22` artifact upload/publish receipt workflow.

## Completed Task (SDNA-34 / DISC-002 Environment Rollout Verification)

Objective:
1. Verify governance workflow rollout in target CI environments and confirm scheduled cadence operates with retained evidence.

Scope:
1. Trigger `.github/workflows/style-dna-evidence-governance.yml` in `hard-gate` and `warning-only` modes and capture run evidence.
2. Confirm artifact upload (`style-dna-governance-status-<app_env>`) appears in run outputs for both pass/fail outcomes.
3. Validate weekly schedule behavior and ownership notification path for stale failures.

Out of scope:
1. Broad UI redesign of Section 3.
2. New non-admin/public taxonomy endpoints.
3. Unrelated style-dna run contract changes.

Definition of done:
1. CI run evidence is captured for both enforcement modes.
2. Artifact persistence is confirmed in real CI runs.
3. Schedule + ownership response path is documented with concrete run references.
4. Regression checks remain green.
5. Task handoff documents files changed, decisions made, risks, and recommended next slice.

Status: Completed 2026-02-28 (hard-gate + warning-only CI runs fresh; manifests and receipts retained under prod paths listed below).

Verification commands:
1. `npm run contracts`
2. `npm run style-dna:taxonomy-seed-library-smoke`
3. `npm run style-dna:taxonomy-seed-diff-smoke`
4. `npm run style-dna:taxonomy-seed-coverage-smoke`
5. `npm run style-dna:taxonomy-seed-apply-coverage-smoke`
6. `npm run style-dna:taxonomy-seed-v2-rollout-smoke`
7. `npm run style-dna:taxonomy-seed-rollout-artifacts-smoke`
8. `npm run style-dna:taxonomy-seed-rollout-artifacts-index-prune-smoke`
9. `npm run style-dna:taxonomy-seed-rollout-artifacts-export-smoke`
10. `npm run style-dna:taxonomy-seed-rollout-artifacts-upload-smoke`

### SDNA-34 evidence verification (2026-02-27)
- Workflow updated to generate/publish evidence in CI and copy upload receipt alongside manifest.
- Hard-gate governance run: https://github.com/cheekymohnkey/prostyle-strength-finder/actions/runs/22482717342 (fresh, manifest+receipt present).
- Warning-only governance run: https://github.com/cheekymohnkey/prostyle-strength-finder/actions/runs/22482780895 (fresh, manifest+receipt present).
- Retention path used: tmp/style-dna-evidence/shared-ci/prod/20260227T103430Z (hard-gate) and tmp/style-dna-evidence/shared-ci/prod/20260227T103627Z (warning-only).

#### Additional evidence (2026-02-27T19:11Z refresh)
- Hard-gate: retention tmp/style-dna-evidence/shared-ci/prod/20260227T190730Z (manifest gov_20260227T190730Z__export_manifest.json, receipt gov_20260227T190730Z__upload_receipt.json; both present).
- Warning-only: retention tmp/style-dna-evidence/shared-ci/prod/20260227T191144Z (manifest gov_20260227T191144Z__export_manifest.json, receipt gov_20260227T191144Z__upload_receipt.json; both present).
	- GeneratedAtUtc: 2026-02-27T19:11:45Z; status fresh within_threshold; appEnv=prod; maxAgeDays=7.

#### Additional evidence (2026-02-28T03:02Z hard-gate)
- Hard-gate: retention tmp/style-dna-evidence/shared-ci/prod/20260228T030211Z (manifest gov_20260228T030211Z__export_manifest.json, receipt gov_20260228T030211Z__upload_receipt.json; both present). GeneratedAtUtc: 2026-02-28T03:02:12Z; status fresh within_threshold; appEnv=prod; maxAgeDays=7. Verify step ran governance:verify with --requireArtifacts true.

#### Additional evidence (2026-02-28T06:13Z hard-gate + warning-only)
- Hard-gate run: https://github.com/cheekymohnkey/prostyle-strength-finder/actions/runs/22514996483 (fresh, manifest+receipt present). Retention: tmp/style-dna-evidence/shared-ci/prod/20260228T061307Z.
- Warning-only run: https://github.com/cheekymohnkey/prostyle-strength-finder/actions/runs/22514997916 (fresh, manifest+receipt present). Retention: tmp/style-dna-evidence/shared-ci/prod/20260228T061315Z.

#### Runbook: verify governance freshness
- Locate latest retention dir under tmp/style-dna-evidence/shared-ci/<app_env>/; expect manifest+receipt files to exist.
- Check status JSON: status should be fresh, reason within_threshold, staleEnvironmentCount=0 while ageDays <= maxAgeDays (7).
- If staleEnvironmentCount > 0 or status != fresh, trigger governance workflow for the affected env and confirm new manifest/receipt are written.
- Commands:
- `npm run governance:verify:prod`
- `npm run governance:verify -- --env prod --status /path/to/latest_governance_status.json`
- Add `--requireArtifacts true` to fail if manifest/receipt are missing: `npm run governance:verify:prod -- --requireArtifacts true`

##### CI post-run check (example)
```yaml
- name: Verify governance evidence (prod)
	run: |
		npm ci
		npm run governance:verify:prod -- --requireArtifacts true --status tmp/style-dna-evidence/shared-ci/prod/latest_governance_status.json
```

## Next Task (SDNA-03 / Baseline Set Admin Endpoints + Audit)

Objective:
1. Finish SD2 admin API surface by hardening baseline set endpoints and audit behavior.

Scope:
1. Ensure baseline endpoint acceptance criteria are fully met:
- baseline model/version + envelope hash validation
- required prompt coverage checks
- idempotent create/update flows where applicable
2. Deterministic cascade delete for baseline-linked records (prompt jobs/items, style-dna runs/results, analysis artifacts, unreferenced images/storage cleanup best-effort).
3. Immutable audit writes + admin-only RBAC verification.
4. Server-side enforcement for sref control baseline policy (sw=0 at same stylize tier) confirmed for baseline operations.

Out of scope:
1. Worker/LLM schema paths (covered by SD3).
2. Frontend UI changes.
3. Taxonomy governance flows.

Definition of done:
1. Baseline endpoints meet validation + RBAC + audit criteria.
2. Delete path performs deterministic cascade without orphaned records.
3. Control-baseline policy is enforced and observable via explicit errors.
4. Regression checks for baseline endpoints pass (existing smoke/integration where applicable).

Work plan (SDNA-03):
1) API contract review: confirm endpoint shapes and validators in shared contracts; ensure model/version/envelope hash validation + required prompt coverage checks.
2) RBAC/audit: verify admin-only guards and immutable audit writes for baseline create/get/list/item-add/delete; ensure idempotency handling where applicable.
3) Control-baseline policy: enforce and error clearly when sref comparisons lack sw=0 baseline at matching stylize tier.
4) Cascade delete: implement deterministic cleanup for baseline-linked records (prompt jobs/items, style-dna runs/results, analysis artifacts, orphan images/storage best-effort).
5) Tests/verification: run or add focused integration covering validation errors, RBAC 403s, idempotent create, control-baseline enforcement, cascade delete; ensure existing smokes for baseline endpoints stay green.

Progress (2026-02-28):
- `npm run contracts` (pass).
- `npm run style-dna:baseline-smoke` (pass; duplicate flow and wrong-kind guard exercised).
- Manual API spot checks (local deterministic API):
	- contributor baseline-set create → 403.
	- missing suiteId → 400.
	- duplicate baseline-set create → 200 with duplicate: true.
	- baseline item upsert with test image → 409 wrong kind.
	- item delete missing promptKey → 400.
	- baseline-set cascade delete → succeeded; summary showed items cleaned and baseline image removed; no prompt jobs/runs/results present.

Status: Completed 2026-02-28 (SDNA-03 acceptance criteria met via smoke + manual verification).

Next up suggestion: proceed to SDNA-04 (prompt generation service/endpoints) or SDNA-05 (run submit/list/get + queue), depending on priority.

## Next Task (SDNA-04 / Prompt Generation Service + Endpoints)

Objective:
1. Finalize prompt generation admin surface: service logic + API endpoints for prompt jobs/items, with deterministic outputs.

Scope:
1. Implement/verify `POST /v1/admin/style-dna/prompt-jobs` and `GET /v1/admin/style-dna/prompt-jobs/:promptJobId` with admin RBAC and audit.
2. Ensure deterministic prompt template rendering (model version flags, envelope, sref/profile inputs) and stable copy-block ordering.
3. Enforce eligibility checks for style influences and baseline coverage (model/version/envelope + stylize tier).
4. Add idempotency/duplicate handling if applicable; surface explicit validation errors.

Out of scope:
1. Worker LLM execution (covered by SD3).
2. Frontend changes (UI handled in SD4/SD9).
3. Run submission/queue (SD5 covers runs if needed).

Definition of done:
1. Prompt job endpoints pass validation, RBAC, and audit requirements.
2. Prompt text generation is deterministic and includes required flags (e.g., `--v`), stylize tier, and envelope inputs.
3. Ineligible influences or missing baseline coverage return clear errors.
4. Tests/smokes for prompt generation flow are green (including existing `style-dna:prompt-generation-smoke` if present).

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

## Progress Addendum (2026-02-28) - Run Ops Playwright Edge Coverage

Status:
1. Completed.

Objective completed:
1. Expand browser-level run operations regression coverage from happy path to edge-state behavior.

Completed in this slice:
1. Expanded deterministic Playwright seed fixture with mixed statuses (succeeded, failed, queued, in_progress) and paging-capable run volume.
2. Added deterministic failed diagnostics fixture data for modal assertions (error code/message path).
3. Added deterministic retry-disabled fixture semantics for missing test-grid reference behavior.
4. Extended Playwright run-ops spec to assert:
- status filter transitions with async refetch stabilization,
- paging interactions with resilient page/count checks,
- retry-disabled affordance and disable reason visibility,
- failed-run selected details and run-detail modal diagnostics.
5. Hardened browser selectors to avoid collision with local Next.js dev tools controls.

Files changed:
1. tests/playwright/setup/seed-style-dna-run-ops.js
2. tests/playwright/style-dna-run-ops.spec.ts

Verification:
1. set -a && source .env.local && set +a && npm run e2e:playwright (pass)
2. Seed output confirms deterministic fixture references and runCount: 13 during setup.

Recommended next task:
1. Split run-ops browser checks into focused specs (filter/paging, retry-disable UX, diagnostics modal) and add one no-runs-state assertion path for deterministic empty-state coverage.

## Progress Addendum (2026-02-28) - Run Ops Regression Follow-up

Status:
1. Completed.

Objective completed:
1. Increase browser-level run-ops regression depth after focused spec split by validating modal trait parity, filter/limit transitions, and retry happy-path interactions.

Completed in this follow-up:
1. Added canonical trait rendering in run-detail modal for successful runs.
2. Added browser assertions for queued/in-progress filter transitions and paging reset behavior.
3. Added browser assertions for limit selector transitions and paging reset behavior.
4. Added browser assertions for retry load-and-clear happy path (`Load for retry` -> stored grid visible -> `Clear` removes state).

Commits (master):
1. ceec4d6 — feat(style-dna): surface canonical traits in run-detail modal
2. dd5f229 — test(playwright): cover queued/in-progress filters and paging reset
3. e46501d — test(playwright): cover retry load-and-clear happy path

Files changed:
1. apps/frontend/app/admin/style-dna/StudioPage.tsx
2. tests/playwright/style-dna-run-ops-detail-states.spec.ts
3. tests/playwright/style-dna-run-ops-filter-paging.spec.ts
4. tests/playwright/style-dna-run-ops-retry-disable.spec.ts

Verification:
1. set -a && source .env.local && set +a && npm run e2e:playwright (pass; 7 specs)

Recommended next task:
1. Add browser assertions for refresh-run selection persistence, stale-detail clearing on influence switch, and modal overlay-dismiss close behavior.

## Progress Addendum (2026-02-28) - Run Ops Interaction Gap Closeout

Status:
1. Completed.

Objective completed:
1. Close remaining run-ops interaction assertions (refresh selection persistence + modal overlay dismissal) under deterministic seeded browser tests.

Completed in this closeout:
1. Added browser assertion for refresh-run selection persistence when selected row remains in filtered result set.
2. Added browser assertion for modal overlay dismissal (click outside closes run-detail modal).
3. Re-verified stale-detail clearing path on influence switch alongside the expanded suite.

Commits (master):
1. 2bbaeea — test(playwright): assert run limit transitions reset paging
2. 33d77e9 — test(playwright): add refresh persistence and modal overlay close checks

Files changed:
1. tests/playwright/style-dna-run-ops-filter-paging.spec.ts
2. tests/playwright/style-dna-run-ops-detail-states.spec.ts

Verification:
1. set -a && source .env.local && set +a && npm run e2e:playwright (pass; 9 specs)

Recommended next task:
1. Refactor run-ops Playwright tests with shared helper utilities to reduce duplicated setup while preserving current behavior assertions.
