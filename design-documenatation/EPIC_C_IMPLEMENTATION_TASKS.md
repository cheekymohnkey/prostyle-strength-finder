# Prostyle Strength Finder - Epic C Implementation Tasks

Status: In progress (Step 1-3 completed; verification/handoff active)  
Date: 2026-02-19  
Depends on:
- `design-documenatation/DECISIONS.md`
- `design-documenatation/ARCHITECTURE_AND_ERD.md`
- `design-documenatation/TECHNICAL_DECISIONS.md`
- `design-documenatation/MVP_PATH.md`
- `design-documenatation/IMPLEMENTATION_PLAN.md`
- `design-documenatation/EPIC_B_IMPLEMENTATION_TASKS.md`

## Purpose

Translate Epic C (MVP-2 Feedback Loop) into executable engineering tasks with clear acceptance criteria, sequencing, and handoff context.

## Current Entry Snapshot (2026-02-19)

1. Epic B recommendation flow is operational and smoke-verified.
2. Recommendation sessions and recommendation records are persisted and queryable.
3. Frontend flow supports upload -> extraction -> confirm -> session retrieval.
4. Epic C work should now add post-result feedback capabilities without regressing Epic B behavior.

## Current Execution Snapshot (2026-02-19 Step 1 Wrap)

1. What was completed:
- C1 feedback/alignment contract validators are implemented in `packages/shared-contracts/src/post-result-feedback.js` and exported via `packages/shared-contracts/src/index.js`.
- C2 persistence migration is implemented in `scripts/db/migrations/20260219133000_feedback_loop_entities.sql`:
  - `post_result_feedback`
  - `alignment_evaluations`
- C2 repository methods are implemented in `scripts/db/repository.js`:
  - `insertPostResultFeedback`
  - `getPostResultFeedbackById`
  - `listPostResultFeedbackBySessionId`
  - `insertAlignmentEvaluation`
  - `getAlignmentEvaluationByFeedbackId`
- Reproducible foundation check script is implemented:
  - `scripts/feedback/foundation-check.js`
  - `npm run feedback:foundation-check`

2. Verification run:
- `set -a; source .env.local.example; set +a`
- `npm run db:reset`
- `npm run feedback:foundation-check`
- Result: `ok: true` with persisted feedback + alignment retrieval.

3. Outstanding risks/issues:
- Image upload and storage linkage for generated output is not yet implemented (C3).
- Alignment evaluation logic is still pending scaffold implementation (C4/C5).

4. Recommended next task:
- Execute Step 2 (`C3 + C4 + C5 Service Slice`).

## Current Execution Snapshot (2026-02-19 Step 2 Wrap)

1. What was completed:
- C3 generated-image upload intake is implemented:
  - migration `scripts/db/migrations/20260219143000_generated_images.sql`
  - repository methods `insertGeneratedImage`/`getGeneratedImageById`
  - API endpoint `POST /v1/generated-images` persists binary via storage adapter and metadata in DB
- C4 deterministic alignment evaluation scaffold is implemented in API:
  - alignment score generation
  - mismatch summary generation
  - prompt-adjustment suggestion generation
  - bounded confidence delta (`[-0.25, 0.25]`)
- C5 emoji weighting policy is implemented:
  - `image + emoji` -> `normal` evidence strength
  - `emoji-only` -> `minor` evidence strength
  - confidence impact scaling reflects evidence strength and remains bounded
- Shared contracts expanded for Step 2 payload validation:
  - `validateGeneratedImageUploadPayload`
  - `validateFeedbackEvaluationPayload`
  - allowed generated-image mime-type constraints

2. Verification run:
- `set -a; source .env.local.example; set +a`
- `npm run db:reset`
- `npm run feedback:service-smoke`
- Result: `ok: true`, with:
  - `normalImpact.confidenceDelta = 0.12` (`image + emoji`)
  - `minorImpact.confidenceDelta = -0.03` (`emoji-only`)

3. Outstanding risks/issues:
- Feedback/alignment retrieval endpoints for standalone read paths are not yet implemented.
- Frontend feedback panel UX is not yet implemented.

4. Recommended next task:
- Execute Step 3 (`C6 + C7 + C8 End-to-End Closure`).

## Current Execution Snapshot (2026-02-19 Step 3 Wrap)

1. What was completed:
- C6 feedback API endpoint set now includes:
  - `POST /v1/post-result-feedback`
  - `GET /v1/post-result-feedback/:feedbackId`
  - `GET /v1/recommendation-sessions/:sessionId/post-result-feedback`
- Ownership enforcement is validated for feedback retrieval routes.
- C7 frontend feedback panel is implemented in `apps/frontend/src/index.js`:
  - recommendation selector
  - optional generated-image upload
  - emoji/useful/comments inputs
  - submit feedback action + feedback list retrieval/rendering
- Frontend proxy routes for feedback endpoints are implemented and validated.
- C8 verification smoke coverage is expanded:
  - API service smoke: `npm run feedback:service-smoke`
  - frontend proxy smoke: `npm run feedback:frontend-proxy-smoke`

2. Verification run:
- `set -a; source .env.local.example; set +a`
- `npm run db:reset`
- `npm run feedback:service-smoke`
- `npm run feedback:frontend-proxy-smoke`
- Result:
  - API smoke `ok: true` including retrieval and ownership checks (`forbiddenStatus: 403`)
  - frontend proxy smoke `ok: true` for submit + retrieval paths

### Epic C Acceptance Matrix (2026-02-19)

| Scope Item | Status | Evidence (file + command/output) | Gaps / Remediation |
| --- | --- | --- | --- |
| C1 contracts | `pass` | `packages/shared-contracts/src/post-result-feedback.js`, `packages/shared-contracts/src/index.js`; `npm run contracts` passed | No blocking gap |
| C2 persistence/migrations | `pass` | `scripts/db/migrations/20260219133000_feedback_loop_entities.sql`, `scripts/db/repository.js`; `npm run feedback:foundation-check` passed | No blocking gap |
| C3 image upload intake | `pass` | `scripts/db/migrations/20260219143000_generated_images.sql`, `apps/api/src/index.js` (`POST /v1/generated-images`) | No blocking gap |
| C4 alignment scaffold | `pass` | deterministic evaluator in `apps/api/src/index.js`; `npm run feedback:service-smoke` output includes alignment payloads | Model-quality tuning deferred |
| C5 emoji weighting policy | `pass` | `apps/api/src/index.js` weighting logic; smoke output confirms normal (`0.12`) vs minor (`-0.03`) bounded deltas | Continue monitoring weighting calibration |
| C6 API linkage + auth | `pass` | `apps/api/src/index.js` retrieval endpoints + ownership checks; service smoke verifies `forbiddenStatus: 403` | No blocking gap |
| C7 frontend feedback panel | `pass` | `apps/frontend/src/index.js`; `npm run feedback:frontend-proxy-smoke` passes through `/api/*` feedback routes | Visual polish optional |
| C8 verification/handoff | `pass` | Smoke commands documented and passing in `README.md`; Epic C matrix + snapshot updated | Prepare Epic D kickoff handoff |

3. Outstanding risks/issues:
- Alignment logic is deterministic scaffold, not final learned evaluation model.
- Feedback weighting constants may need calibration after first real usage telemetry.

4. Recommended next task:
- Begin Epic D planning and first implementation slice selection (admin + contributor essentials).

## Epic C - Feedback Loop (MVP-2)

Objective:
- Close the loop after external generation by capturing result evidence and returning actionable alignment guidance.

### Scope

1. Optional generated-image upload path tied to a recommendation session.
2. Expected-vs-observed alignment evaluation output.
3. Prompt adjustment suggestions from mismatch analysis.
4. Alternative profile/sref recommendation suggestions from mismatch analysis.
5. Emoji sentiment capture with weighting rules.
6. Frontend feedback panel path for quick submission.

### Out of Scope

1. Render orchestration with external generation platforms.
2. Advanced model-based alignment scoring beyond deterministic MVP scaffold.
3. Broad analytics dashboards or long-horizon model retraining loops.
4. Admin moderation/governance workflows (Epic D).

### Constraints

1. Feedback writes must be auditable and tied to recommendation session entities.
2. Emoji weighting policy must match source-of-truth MVP rules:
- image + emoji = normal impact
- emoji-only = minor impact
3. Confidence adjustments from feedback must remain bounded.
4. Existing Epic B confirm/session behavior must remain unchanged.
5. API contracts must stay versioned and validation-backed via shared contracts package.

## Task Breakdown

## C1. Feedback Domain Contracts

Description:
- Define shared request/response contracts for post-result feedback and alignment output.

Implementation tasks:
1. Add contracts for feedback submit payload (`recommendationSessionId`, `recommendationId`, optional image reference, optional emoji/useful/comments).
2. Add contracts for alignment evaluation response (`alignmentScore`, `mismatchSummary`, `suggestedPromptAdjustments`, `alternativeCombinationIds`).
3. Add validation + stable error response behavior for invalid feedback payloads.

Acceptance criteria:
1. Shared contracts export feedback + alignment shapes.
2. API and frontend use the same contract definitions.
3. Invalid payloads return stable `api-error` responses.

## C2. Persistence and Migration for Feedback Entities

Description:
- Add minimal relational persistence for feedback and alignment records.

Implementation tasks:
1. Add migration(s) for:
- `post_result_feedback`
- `alignment_evaluations`
2. Add indexes for hot paths:
- feedback by `recommendation_session_id`
- alignment by `feedback_id`
3. Add repository methods for create/get/list feedback and alignment records.

Acceptance criteria:
1. Migrations apply from zero and existing Epic B state.
2. Feedback/alignment rows persist with expected foreign-key linkage.
3. Query paths return auditable records for session-level retrieval.

## C3. Generated Image Upload Intake (S3 + Metadata)

Description:
- Accept optional generated-image uploads and persist image metadata linked to feedback.

Implementation tasks:
1. Add API endpoint for generated-image upload intake.
2. Store binary in configured storage adapter path and persist image metadata record (source type, storage URI, user, timestamp).
3. Enforce allowed mime/size guardrails and return actionable validation errors.
4. Tie uploaded image reference to feedback write path.

Acceptance criteria:
1. User can upload generated image and receive persisted reference ID/URI.
2. Storage write/read metadata path works in local pre-prod mode.
3. Upload failures are explicit and do not create partial orphan records.

## C4. Alignment Evaluation Scaffold

Description:
- Produce deterministic expected-vs-observed guidance from feedback evidence.

Implementation tasks:
1. Add alignment evaluation service scaffold returning:
- `alignmentScore`
- `mismatchSummary`
- `suggestedPromptAdjustments`
- `alternativeCombinationIds`
2. Support two evidence modes:
- image-backed feedback
- emoji/useful/comments-only feedback
3. Bound confidence adjustment effects for MVP safety.

Acceptance criteria:
1. Alignment evaluation response is always present for accepted feedback submissions.
2. Suggestion fields are non-empty when mismatch is non-trivial.
3. Confidence-impact values remain bounded and deterministic for same input.

## C5. Emoji Sentiment Weighting Policy

Description:
- Encode and enforce MVP weighting rules for sentiment evidence quality.

Implementation tasks:
1. Implement weighting logic:
- image + emoji => normal impact
- emoji-only => minor impact
2. Preserve neutral behavior when emoji is absent.
3. Persist weighting basis for auditability (derived evidence strength).

Acceptance criteria:
1. Policy behavior matches `MVP_PATH.md` rules exactly.
2. Emoji-only submissions cannot produce large confidence swings.
3. Stored feedback records indicate weighting basis used at evaluation time.

## C6. Feedback API Endpoints and Session Linkage

Description:
- Expose feedback-loop operations through versioned endpoints.

Implementation tasks:
1. Add feedback submission endpoint linked to recommendation session/recommendation IDs.
2. Add feedback retrieval endpoint(s) for session context.
3. Add alignment retrieval endpoint(s) tied to feedback ID.
4. Enforce auth and ownership checks consistent with Epic B middleware.
5. Add request correlation logs (`request_id`, `session_id`, `feedback_id`).

Acceptance criteria:
1. Authenticated user can submit feedback tied to owned recommendation sessions.
2. API returns alignment payload and persisted identifiers.
3. Unauthorized/mismatched session access is rejected.

## C7. Frontend MVP-2 Feedback Panel

Description:
- Add minimal feedback UX on top of recommendation results.

Implementation tasks:
1. Add optional generated-image upload control.
2. Add emoji sentiment + useful toggle + optional comment controls.
3. Add submit action and render alignment response blocks.
4. Surface evidence-strength context (for example, emoji-only treated as minor impact).

Acceptance criteria:
1. User can submit post-result feedback in under 1 minute.
2. UI clearly communicates alignment result and next-step suggestions.
3. UI handles image and emoji-only paths without confusion.

## C8. Verification and Handoff

Description:
- Verify Epic C completion criteria and document residual risks.

Implementation tasks:
1. Add backend checks for:
- feedback write linkage and idempotency expectations
- weighting policy enforcement
- bounded confidence adjustments
- alignment response-shape guarantees
2. Add minimal frontend checks for feedback submit/render path.
3. Add reproducible smoke flow for recommendation-session -> feedback submission -> alignment retrieval.
4. Document known follow-ups for Epic D/E.

Acceptance criteria:
1. Epic C done criteria from implementation plan are demonstrably met.
2. Smoke path is reproducible from clean checkout.
3. Residual follow-ups are explicitly documented.

## Epic C Done Checklist

1. User can upload generated result image and submit post-result feedback.
2. System returns expected-vs-observed alignment guidance.
3. Prompt adjustment suggestions are returned when mismatch exists.
4. Alternative combination suggestions are returned when applicable.
5. Emoji weighting rules are enforced (`image+emoji` normal, `emoji-only` minor).
6. Feedback writes are auditable and tied to recommendation session records.
7. Frontend feedback panel supports end-to-end submission and response rendering.

## Suggested Execution Sequence

1. C1 Feedback Domain Contracts
2. C2 Persistence and Migration for Feedback Entities
3. C3 Generated Image Upload Intake (S3 + Metadata)
4. C4 Alignment Evaluation Scaffold
5. C5 Emoji Sentiment Weighting Policy
6. C6 Feedback API Endpoints and Session Linkage
7. C7 Frontend MVP-2 Feedback Panel
8. C8 Verification and Handoff

## Risks and Controls

1. Risk: Feedback quality is noisy for emoji-only submissions.  
Control: enforce minor-impact weighting and bounded adjustments.

2. Risk: Upload failures create inconsistent feedback state.  
Control: transactional write ordering and explicit rollback/failure handling.

3. Risk: Alignment explanation appears arbitrary.  
Control: deterministic scaffold rules with transparent rationale fields.

4. Risk: Session ownership leakage in feedback endpoints.  
Control: strict auth + ownership checks on feedback and retrieval routes.

5. Risk: Epic C changes regress Epic B recommendation flow.  
Control: keep Epic B smoke in pre-merge verification and isolate Epic C routes.

## Execution History (Step 1-3 Completed on 2026-02-19)

### Step 1 Completion Record

Outcome:
1. C1 shared contracts were added for feedback submit and alignment envelopes.
2. C2 migrations/repository methods were added for feedback and alignment persistence.
3. Foundation verification (`npm run feedback:foundation-check`) passed.

### Step 2 Completion Record

Outcome:
1. C3 generated-image upload intake was added with storage adapter persistence.
2. C4 deterministic alignment scaffold was implemented with bounded confidence deltas.
3. C5 emoji weighting policy was enforced (`image+emoji` normal, `emoji-only` minor).
4. Service verification (`npm run feedback:service-smoke`) passed.

### Step 3 Completion Record

Outcome:
1. C6 retrieval endpoints with ownership checks were added.
2. C7 frontend feedback panel + proxy routes were implemented.
3. C8 verification/handoff evidence was added to this document.
4. Frontend proxy verification (`npm run feedback:frontend-proxy-smoke`) passed.

### Execution Notes

1. Keep slices narrow and feature-flag risky behavior where needed.
2. Reuse Epic B session identifiers and contracts instead of introducing parallel identifiers.
3. Keep source-of-truth linkage explicit in all handoffs:
- `design-documenatation/DECISIONS.md`
- `design-documenatation/MVP_PATH.md`
- `design-documenatation/IMPLEMENTATION_PLAN.md`
- `design-documenatation/EPIC_C_IMPLEMENTATION_TASKS.md`
