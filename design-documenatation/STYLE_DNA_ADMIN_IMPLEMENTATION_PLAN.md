# Prostyle Strength Finder - Style-DNA Admin Implementation Plan

Status: Draft  
Date: 2026-02-21  
Depends on:
- `design-documenatation/DECISIONS.md`
- `design-documenatation/ARCHITECTURE_AND_ERD.md`
- `design-documenatation/TECHNICAL_DECISIONS.md`
- `design-documenatation/IMPLEMENTATION_PLAN.md`
- `design-documenatation/UI_UPGRADE_IMPLEMENTATION_PLAN.md`
- `design-documenatation/LLM_WORKFLOW.md`

## Purpose

Define a dedicated, execution-ready implementation plan for the admin-only Style-DNA workflow:
1. Reusable baseline sets (created once per MidJourney model/version + parameter envelope).
2. Stored style influence selection (srefs/moodboards).
3. System-generated copy-ready MidJourney prompt strings.
4. Admin upload/paste of returned test grid images.
5. Queued strict-JSON LLM analysis and persisted trait output.

## Feature Objective

Enable administrators to run rigorous, repeatable baseline-vs-test aesthetic delta analysis with minimal manual overhead and strong auditability.

## Primary Use Cases (Explicit Split)

1. Use Case 1: Baseline Test Definition Management
- Admin manages baseline prompt templates and locked parameter envelopes (model/version, seed, stylize tier, quality, aspect ratio, and generation flags).

2. Use Case 2: Baseline Grid Capture
- Admin selects a baseline test definition, renders externally in MidJourney, uploads the returned baseline 2x2 grid, and stores it as canonical baseline evidence for that test definition.

3. Use Case 3: Style Adjustment Comparison Run
- Admin selects a baseline test with stored baseline grid, selects adjustment type (`--sref` or `--profile`), enters MidJourney adjustment ID, copies system-generated prompt, renders externally, uploads test grid, then system compares baseline vs test using strict-schema LLM extraction and persists traits/results linked to the selected style adjustment.

## Scope

In scope:
1. Admin-only Style-DNA console in frontend.
2. Baseline set registry and lifecycle management.
3. Prompt generation service for selected style influences.
4. Style-DNA analysis run submission/status/result APIs.
5. Worker integration with strict JSON schema vision extraction.
6. Persistence for raw outputs, normalized atomic traits, canonical mapped traits.
7. Smoke/integration coverage for happy path and failure paths.

Out of scope:
1. MidJourney render automation/orchestration.
2. Consumer-facing exposure of Style-DNA run controls.
3. Full taxonomy governance product redesign.
4. Per-quadrant mandatory image splitting (defer unless needed).

## Workflow Contract (End-to-End)

1. Admin creates/selects baseline test definition (prompt suite + fixed parameter envelope).
2. Admin uploads baseline render grid(s) for baseline definition coverage.
3. Admin chooses style adjustment type (`sref|profile`) and MidJourney ID.
4. System generates copy-ready prompt lines that inject `--sref <id>` or `--profile <id>`.
5. Admin renders externally and uploads returned test grid(s).
6. API enqueues Style-DNA run with baseline/test image pair and adjustment metadata.
7. Worker compares Grid B vs Grid A using strict JSON schema and persists results.
8. Admin views structured delta output + downstream trait persistence artifacts.

## Baseline Reuse Rules

A baseline grid can be reused only when all match:
1. MidJourney model family/version.
2. Baseline prompt suite version.
3. Parameter envelope hash:
- seed
- stylize tier
- quality
- raw/style flag
- aspect ratio and other locked generation flags.

If any key differs, baseline set is treated as incompatible and a new set is required.

## Vision Extraction Contract

Use this contract for baseline-vs-test grid analysis tasks.

1. Inputs required:
- admin-selected `style_influence_id` (sref/moodboard)
- resolved `baseline_render_set_id` (matching MJ model/version + parameter envelope)
- `grid_a_baseline` image (single 2x2 grid PNG)
- `grid_b_test` image (single 2x2 grid PNG)
- shared parameter envelope:
  - prompt text
  - seed
  - stylize tier
  - quality
  - raw/style flag
  - profile/sref/sw values

2. Prompt generation rule:
- generate paste-ready MidJourney prompt lines from baseline prompt suite + selected style influence
- keep output deterministic and copy-friendly (one prompt per line, no commentary in copy block)

3. Prompting rules:
- keep system prompt in a versioned text file loaded at runtime
- ask for atomic trait strings (not long prose)
- require delta-only reporting (traits introduced/amplified in Grid B vs Grid A)
- require JSON-only response

4. Response-format rules (OpenAI):
- use `response_format.type = json_schema`
- use `strict = true`
- mark all object fields as required
- set `additionalProperties = false` on all objects
- use empty arrays or `"No change"` instead of optional fields

5. Minimum output families:
- `composition_and_structure`
- `lighting_and_contrast`
- `color_palette`
- `texture_and_medium`
- `dominant_dna_tags`
- `delta_strength`

6. Post-processing boundary:
- LLM outputs open atomic traits
- backend handles canonical mapping, alias merging, and taxonomy version assignment
- do not force full taxonomy enums in vision prompt

## Trait Synonym Squashing Policy

Reference schema drafts:
1. `design-documenatation/TRAIT_TAXONOMY_SCHEMA_DRAFT.json`
2. `design-documenatation/TRAIT_TAXONOMY_SQL_DRAFT.sql`

Policy:
1. Canonical-first registry:
- each trait maps to one `canonical_trait_id` and one display label
- variants map through `trait_aliases` -> `canonical_trait_id`

2. Normalize before lookup:
- lowercase
- trim whitespace
- convert hyphen/underscore to spaces
- collapse repeated spaces
- singularize simple plurals where safe

3. Alias resolution order:
- exact canonical label match
- exact alias match
- normalized string match
- embedding-assisted candidate merge

4. Auto-merge thresholds (both required):
- lexical Jaccard token similarity `>= 0.70`
- embedding cosine similarity `>= 0.88`

5. Manual-review gate:
- if either threshold fails, do not auto-merge
- if semantically close but intent differs, route to review

6. Ambiguity denylist:
- reject vague labels such as `style`, `quality`, `nice lighting`, `good colors`
- require concrete remap to approved trait family/definition

7. Versioning and audit:
- persist alias decisions with `taxonomy_version`, timestamp, and reviewer/source
- never hard-delete aliases; mark deprecated when replaced
- replay/re-analysis must use the taxonomy version active at original scoring time

8. Discovery-mode boundary:
- open-trait discovery can propose candidates
- production scoring uses canonical traits only until approved

## Data Model Additions (Proposed)

## 1) Baseline Prompt Suites

`baseline_prompt_suites`
1. `id`
2. `name`
3. `suite_version`
4. `status` (`active`, `deprecated`)
5. `created_by`
6. `created_at`

`baseline_prompt_suite_items`
1. `id`
2. `suite_id`
3. `prompt_key` (stable key)
4. `prompt_text`
5. `display_order`
6. `created_at`

## 2) Baseline Render Sets

`baseline_render_sets`
1. `id`
2. `mj_model_family` (`standard`, `niji`)
3. `mj_model_version`
4. `suite_id`
5. `parameter_envelope_json`
6. `parameter_envelope_hash`
7. `status` (`draft`, `active`, `deprecated`)
8. `created_by`
9. `created_at`

`baseline_render_set_items`
1. `id`
2. `baseline_render_set_id`
3. `prompt_key`
4. `grid_image_id`
5. `created_at`

## 3) Prompt Generation Jobs

`style_dna_prompt_jobs`
1. `id`
2. `style_influence_id`
3. `baseline_render_set_id`
4. `requested_tiers_json`
5. `status` (`generated`, `deprecated`)
6. `created_by`
7. `created_at`

`style_dna_prompt_job_items`
1. `id`
2. `prompt_job_id`
3. `prompt_key`
4. `stylize_tier`
5. `prompt_text_generated`
6. `copy_block_order`
7. `created_at`

## 4) Analysis Pair and Result Persistence

`style_dna_runs`
1. `id`
2. `style_influence_id`
3. `baseline_render_set_id`
4. `prompt_key`
5. `stylize_tier`
6. `baseline_grid_image_id`
7. `test_grid_image_id`
8. `analysis_run_id` (link to shared run envelope)
9. `status` (`queued`, `in_progress`, `succeeded`, `failed`, `dead_letter`)
10. `created_by`
11. `created_at`

`style_dna_run_results`
1. `id`
2. `style_dna_run_id`
3. `llm_raw_json`
4. `atomic_traits_json`
5. `canonical_traits_json`
6. `taxonomy_version`
7. `summary`
8. `created_at`

Note:
1. Concrete table naming can be adjusted to fit existing repository conventions.
2. Where possible, reuse `analysis_runs` lifecycle fields instead of duplicating.

## API Plan (Admin Endpoints)

All routes require admin role.

## A) Baseline Set Management

1. `POST /v1/admin/style-dna/baseline-sets`
- Create baseline render set metadata.
- Request includes model/version, suite id, parameter envelope.

2. `GET /v1/admin/style-dna/baseline-sets`
- List filterable by model/version, suite version, status.

3. `GET /v1/admin/style-dna/baseline-sets/:baselineRenderSetId`
- Retrieve set details including prompt coverage completeness.

4. `POST /v1/admin/style-dna/baseline-sets/:baselineRenderSetId/items`
- Attach baseline grid image for a prompt key.

## B) Prompt Generation

1. `POST /v1/admin/style-dna/prompt-jobs`
- Input: `styleInfluenceId`, `baselineRenderSetId`, `stylizeTiers[]`.
- Output: generated copy-ready prompt blocks.

2. `GET /v1/admin/style-dna/prompt-jobs/:promptJobId`
- Retrieve generated prompts and metadata.

## C) Style-DNA Analysis Runs

1. `POST /v1/admin/style-dna/runs`
- Input: `styleInfluenceId`, `baselineRenderSetId`, `promptKey`, `stylizeTier`, `testGridImage`.
- Server resolves baseline grid reference and enqueues run.

2. `GET /v1/admin/style-dna/runs/:styleDnaRunId`
- Status and result envelope.

3. `GET /v1/admin/style-dna/runs`
- Filter list by influence, model/version, status, date range.

## D) Supporting Lookup

1. `GET /v1/admin/style-influences?type=sref|profile`
- Existing/extended endpoint to drive picker list.

## Validation Rules

1. Reject run submission if baseline set coverage for `prompt_key` is missing.
2. Reject if style influence is disabled/deprecated.
3. Reject cross-tier mismatch (request tier must match baseline item tier contract).
4. Enforce idempotency key for run submission.
5. Return stable `api-error` payloads for all validation failures.

## Frontend Plan (Admin Console)

## Route

1. Add admin route: `/admin/style-dna`.

## Panels

1. Baseline Set Selector:
- model family/version
- suite version
- envelope signature
- coverage/completeness indicator.

2. Style Influence Picker:
- searchable list of stored srefs/moodboards
- status indicators (`active`, `disabled`, `experimental`).

3. Prompt Generation Panel:
- choose tier set (`0`, `100`, `1000`)
- generate prompts button
- one-click copy prompt lines.

4. Test Grid Intake Panel:
- per prompt_key upload/paste zone
- preview and submit for analysis.

5. Run Status/Result Panel:
- queued/in_progress/succeeded/failed indicators
- structured categories:
  - structural
  - lighting
  - color
  - texture
  - dominant tags
  - delta strength.

## UX Rules

1. Disable submit action until baseline set + style influence + prompt_key + test grid are present.
2. Show explicit mismatch message if selected baseline set is incompatible.
3. Keep generated prompt copy blocks plain-text, no explanatory prefixes.
4. Show trace IDs or run IDs for supportability.

## Worker/LLM Plan

1. Worker consumes style-dna job envelope from SQS.
2. Loads versioned system prompt file.
3. Calls OpenAI with `response_format.type = json_schema` and `strict = true`.
4. Validates response object against shared schema.
5. Persists:
- raw JSON
- normalized atomic traits
- canonicalized mapped traits
- taxonomy version.
6. Updates run status and emits structured logs with:
- `request_id`
- `job_id`
- `analysis_run_id`
- `style_dna_run_id`.

Failure handling:
1. Schema parse/validation failure -> retryable up to max attempts; then dead-letter.
2. Missing baseline linkage -> non-retryable validation failure.
3. Provider transient error -> retry with backoff.

## Prompt and Schema Versioning

Persist on each run:
1. `analysis_prompt_version`
2. `llm_model_family`
3. `llm_model_version`
4. `trait_schema_version`
5. `taxonomy_version`

This is required for replay and historical comparability.

## Security and Access Control

1. Admin-only RBAC on all Style-DNA mutation and execution endpoints.
2. Read-only views may be expanded later; not in current scope.
3. Audit records required for:
- baseline set create/update/deprecate
- prompt generation job creation
- run submission/retry.

## Observability Plan

Metrics:
1. `style_dna_run_submit_count`
2. `style_dna_run_success_count`
3. `style_dna_run_failure_count`
4. `style_dna_schema_validation_failure_count`
5. `style_dna_unmapped_trait_count`
6. `style_dna_run_latency_ms` (p50/p95)

Logs:
1. Structured logs for enqueue, worker start, provider response validation, persistence completion.
2. Include model/version and prompt/schema versions in logs.

## Delivery Phases

## SD0. Contract Lock

Tasks:
1. Finalize API payloads and shared validators.
2. Finalize baseline envelope fields and hash strategy.
3. Finalize prompt suite seed prompts and suite version.

Done when:
1. No unresolved contract questions.
2. Shared schemas are committed.

## SD1. Persistence Foundation

Tasks:
1. Add migrations for baseline sets, prompt jobs, style-dna runs/results.
2. Add repository methods and indexes for hot paths.
3. Add audit linkage fields.

Done when:
1. DB reset applies migrations cleanly.
2. Repository paths return expected entities.

## SD2. Admin API Surface

Tasks:
1. Baseline set create/list/get/attach routes.
2. Prompt generation create/get routes.
3. Style-dna run submit/status/list routes.
4. RBAC enforcement + stable error responses.

Done when:
1. Endpoint contracts pass integration tests.
2. Non-admin calls return `403`.

## SD3. Worker + LLM Strict Schema Integration

Tasks:
1. Queue envelope support for style-dna jobs.
2. Prompt file loader and schema validation pipeline.
3. Persistence of raw + mapped results.
4. Retry/dead-letter behavior.

Done when:
1. Happy path run reaches `succeeded`.
2. Schema failure and transient error paths are covered.

## SD4. Admin UI Implementation

Tasks:
1. `/admin/style-dna` route scaffold and auth gating.
2. Baseline set selector and influence picker.
3. Prompt generation/copy UX.
4. Test grid intake and run results rendering.

Done when:
1. Admin can complete full workflow without API tooling.
2. UI error states are explicit.

## SD5. Verification and Hardening

Tasks:
1. Add smoke scripts:
- baseline set lifecycle smoke
- prompt generation smoke
- run submit/status/result smoke
- strict schema failure smoke
2. Add observability checks for queue/run metrics.
3. Update README runbook.

Done when:
1. All style-dna smokes return `ok: true`.
2. Launch-impacting regressions are absent in existing core smokes.

## Test Strategy

Unit:
1. Parameter envelope hash determinism.
2. Prompt generator output correctness.
3. Trait normalization/mapping behavior.

Integration:
1. API + DB for baseline set and prompt job flows.
2. API enqueue + worker consume + persistence.
3. RBAC + validation + idempotency enforcement.

Smoke:
1. End-to-end admin happy path.
2. Missing-baseline rejection path.
3. Invalid schema provider-response path.

## Rollout Plan

1. Ship behind admin feature flag.
2. Run style-dna smoke suite in local then prod-like environment.
3. Enable for admin operations only.
4. Monitor failure and unmapped-trait rates before expanding usage.

Rollback:
1. Disable feature flag.
2. Keep persisted historical results read-only accessible.
3. No schema rollback required unless migration issue is identified.

## Risks and Mitigations

1. Risk: Prompt drift reduces result consistency.
Mitigation: versioned prompt files + immutable run-time prompt version capture.

2. Risk: Baseline mismatch causes invalid comparisons.
Mitigation: strict compatibility check on model/version + envelope hash.

3. Risk: Synonym explosion in extracted traits.
Mitigation: post-extraction canonical mapping + review queue + taxonomy versioning.

4. Risk: Operator friction for baseline coverage.
Mitigation: completeness indicators and missing-prompt warnings in UI.

## Definition of Done (Feature)

1. Admin can select stored sref/moodboard and generate copy-ready prompts.
2. Baselines are reused correctly by model/version + envelope without re-uploading duplicates.
3. Admin can upload/paste returned test grids and enqueue analysis.
4. Worker returns strict-schema trait output and persists raw + canonical forms.
5. Result views are available in admin UI with status and structured trait categories.
6. Smoke suite covers happy path and critical failure paths.
