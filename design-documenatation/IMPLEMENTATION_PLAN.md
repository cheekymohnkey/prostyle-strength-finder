# Prostyle Strength Finder - Implementation Plan v1

Status: Agreed  
Date: 2026-02-18  
Depends on:
- `design-documenatation/DECISIONS.md`
- `design-documenatation/USER_NEEDS_ANALYSIS.md`
- `design-documenatation/ARCHITECTURE_AND_ERD.md`
- `design-documenatation/MVP_PATH.md`
- `design-documenatation/TECHNICAL_DECISIONS.md`
Approved on: 2026-02-18

## Goal

Convert agreed design artifacts into executable engineering work with clear sequencing, dependencies, and done criteria.

## Current Status Snapshot (2026-02-20)

1. Epic A foundation scope is complete in implementation.
2. Non-local infrastructure baseline is provisioned via Terraform:
- UAT S3 + SQS + DLQ
- Prod S3 + SQS + DLQ
3. Live non-local smoke verification has passed for both environments:
- S3: put/head/get/delete
- SQS: send/receive/delete
4. Current execution focus:
- Production deployment planning from local-first baseline, with optional UAT kept for future activation.
5. UI upgrade status:
- Next.js frontend is now default local frontend entrypoint.
- Legacy frontend is retained as fallback during migration window.
- Launch readiness smoke currently passes with Next frontend flow.

## Delivery Structure

1. Epic A: Platform Foundation
2. Epic B: Core Recommendation Flow (MVP-1)
3. Epic C: Feedback Loop (MVP-2)
4. Epic D: Admin + Contributor Essentials (MVP-3)
5. Epic E: Hardening, Observability, and Launch Readiness
6. UI Upgrade Track: Frontend stack alignment and migration plan
7. Style-DNA Delta Track: Controlled baseline-vs-test grid analysis

UI Upgrade reference:
- `design-documenatation/UI_UPGRADE_IMPLEMENTATION_PLAN.md`
Style-DNA dedicated reference:
- `design-documenatation/STYLE_DNA_ADMIN_IMPLEMENTATION_PLAN.md`
Style-DNA execution tasks:
- `design-documenatation/STYLE_DNA_ADMIN_IMPLEMENTATION_TASKS.md`

## Epic A: Platform Foundation

Objective:
- Establish baseline stack and runtime architecture.

Scope:
1. Repository structure for API, worker, frontend, shared contracts.
2. Environment configuration contract (`local`, `prod`, with optional `uat`).
3. SQLite setup + migration framework.
4. S3 storage adapter + bucket structure conventions.
5. SQS queue setup + DLQ policy scaffolding.
6. Cognito + Google sign-in integration skeleton.
7. CloudWatch structured logging wiring.

Definition of done:
1. API and worker processes start and run locally.
2. DB migrations apply cleanly from zero state.
3. SQS enqueue/dequeue path works in local pre-prod mode.
4. Auth flow can issue and validate JWT for protected endpoints.

Dependencies:
- None (starting epic).

## Epic B: Core Recommendation Flow (MVP-1)

Objective:
- Ship prompt-to-recommendation flow with rationale/confidence.

Scope:
1. Upload-first recommendation submission endpoint and session model (MidJourney PNG metadata extraction).
2. Recommendation mode handling (`precision`, `close enough`).
3. Style influence retrieval/filtering and ranking service.
4. Confidence/risk formatting rules.
5. Prompt improvement suggestion output.
6. Frontend recommendation page with mode switch and ranked results.

Definition of done:
1. User can complete recommendation flow in one session.
2. Each recommendation returns rationale + confidence + risk notes.
3. Mode thresholds are applied:
- `precision >= 0.65`
- `close enough >= 0.45`
4. Low-confidence behavior is explicitly labeled.

Dependencies:
- Epic A complete.

## Epic C: Feedback Loop (MVP-2)

Objective:
- Close loop from generated result back into recommendation quality signals.

Scope:
1. Post-result image upload path to S3.
2. Alignment evaluation endpoint + run processing.
3. Prompt adjustment and alternative recommendation outputs.
4. Emoji sentiment feedback capture and weighting logic.
5. Frontend feedback panel UX.

Definition of done:
1. User can upload result image and receive expected-vs-observed feedback.
2. Emoji weighting rules are enforced:
- image + emoji = normal impact
- emoji-only = minor impact
3. Feedback writes are auditable and tied to recommendation session.

Dependencies:
- Epic B complete.

## Epic D: Admin + Contributor Essentials (MVP-3)

Objective:
- Enable operational governance and profile growth workflows.

Scope:
1. Admin moderation actions (flag/remove/re-run).
2. Style influence governance (disable/pin/unpin).
3. Prompt curation states (`active`, `deprecated`, `experimental`).
4. Approval mode control (`auto-approve` default, `manual` available).
5. Contributor upload/add/trigger status and retry flows.
6. Basic audit trail for high-impact actions.

Definition of done:
1. Admin can prevent problematic influences from affecting active recommendations.
2. Contributor can submit and iterate without admin intervention for normal cases.
3. Governance changes invalidate relevant caches.

Dependencies:
- Epic A complete.
- Epic B mostly complete (shared models and recommendation path).

## Epic E: Hardening, Observability, and Launch Readiness

Objective:
- Ensure reliability, recoverability, and release safety.

Scope:
1. Backup automation for SQLite to S3.
2. Restore drill scripts/playbook and validation run.
3. Queue retry/dead-letter monitoring and admin requeue flow validation.
4. Test suite baseline:
- backend unit/integration emphasis
- minimal frontend tests
- E2E smoke scenarios
5. Performance checks for target latency budgets.

Definition of done:
1. Backup/restore policy is operationalized and tested.
2. Failure modes are observable in logs and operational views.
3. MVP acceptance checks pass.

Dependencies:
- Epics B/C/D substantially complete.

## First Sprint (Vertical Slice) - Recommended

Goal:
- Deliver one end-to-end slice proving architecture viability.

Scope:
1. Cognito+Google login (basic protected API access).
2. Prompt submission endpoint.
3. SQS job enqueue for analysis.
4. Worker consumes one analysis job and writes `analysis_runs` + `image_trait_analyses` to SQLite.
5. Minimal frontend page to submit prompt and view job/result status.

Sprint done criteria:
1. One authenticated user can submit a job and retrieve persisted result.
2. Queue retry path works for forced transient failure.
3. Logs include `request_id`, `job_id`, and `analysis_run_id`.

## Dependency Graph (High Level)

1. Epic A -> Epic B
2. Epic B -> Epic C
3. Epic A + B -> Epic D
4. B + C + D -> Epic E

## Risk Register (Execution)

1. Risk: Auth integration slows early delivery.
Mitigation: keep first slice narrow (Hosted UI + protected endpoint only).

2. Risk: Queue/worker idempotency bugs.
Mitigation: implement idempotency policy before broad endpoint buildout.

3. Risk: SQLite contention under unexpected load.
Mitigation: keep writes short/atomic, monitor contention, migrate when thresholds are hit.

4. Risk: Scope creep from non-MVP exploration features.
Mitigation: enforce MVP scope gates from `MVP_PATH.md`.

## Exit Criteria for Implementation Plan v1

1. Epics accepted and ordered.
2. First sprint scope accepted.
3. Team agrees definitions of done and dependency order.

## Style-DNA Delta Track (Cross-Tier)

Objective:
- Implement a rigorous style influence analysis workflow using paired MidJourney grids and strict structured LLM extraction.

Scope:
1. Implement this as an admin-only workflow.
2. Accept baseline/test grid pair uploads plus shared render parameter envelope.
3. Run vision analysis with strict JSON schema output.
4. Persist raw extraction and normalized/canonical trait outputs.
5. Support stylize-tiered comparison (`0`, `100`, `1000`) with same-tier delta rules.
6. Add reusable baseline-set management keyed by MidJourney version + parameter envelope.
7. Expose API/UI surfaces for prompt generation, pair submission, status, and results.

Out of scope:
1. In-app MidJourney rendering orchestration.
2. Mandatory per-quadrant image splitting for MVP.

### Tier Breakdown

Frontend:
1. Add admin-only style-dna console.
2. Add stored style-influence list/select UI (srefs/moodboards).
3. Add prompt-generation UI producing copy-ready MidJourney prompt blocks.
4. Add paired-grid intake UX (Baseline Grid A, Test Grid B), with baseline pre-linked from reusable baseline set.
5. Show extraction status + structured result panels (structural, lighting, color, texture, tags).

API:
1. Add baseline-set endpoints (create/list/get) keyed by MJ model/version + parameter envelope hash.
2. Add prompt-generation endpoint that takes selected style influence and emits paste-ready prompts.
3. Add submit endpoint for style-dna jobs with pair validation and idempotency.
4. Add status/result endpoints returning both raw and canonicalized views.
5. Enforce schema version + prompt version references per run.

Worker/LLM:
1. Load prompt text from versioned file at runtime.
2. Call OpenAI with strict schema response format.
3. Validate response against contract; fail job with explicit error codes on schema mismatch.

Persistence:
1. Store reusable baseline sets and their prompt-level baseline grid references.
2. Store baseline/test image references and pair linkage.
3. Store LLM raw JSON response for audit/replay.
4. Store normalized atomic traits and mapped canonical traits with taxonomy version.

Taxonomy governance:
1. Apply alias/synonym snapping after extraction.
2. Route low-confidence or ambiguous traits to manual-review queue.
3. Keep discovery-mode candidates separate from production canonical traits until approved.

Observability/testing:
1. Add smoke for strict JSON contract success/failure paths.
2. Add deterministic fixture tests for stylize-tier comparison behavior.
3. Track metrics: extraction success rate, schema-failure rate, unmapped trait rate, median analysis latency.

Definition of done:
1. Admin can generate copy-ready prompts for a selected stored style influence.
2. Admin can upload returned test grid(s) and retrieve structured delta output against matching reusable baselines.
3. Strict schema responses parse without fallback string handling.
4. Canonical trait mapping runs with auditable alias/taxonomy version metadata.
5. Same-tier stylize comparisons are enforced by API validation rules.
