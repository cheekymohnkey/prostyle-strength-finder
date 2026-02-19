# Prostyle Strength Finder - Epic B Implementation Tasks

Status: Draft for execution  
Date: 2026-02-18  
Depends on:
- `design-documenatation/DECISIONS.md`
- `design-documenatation/ARCHITECTURE_AND_ERD.md`
- `design-documenatation/TECHNICAL_DECISIONS.md`
- `design-documenatation/MVP_PATH.md`
- `design-documenatation/IMPLEMENTATION_PLAN.md`
- `design-documenatation/EPIC_A_IMPLEMENTATION_TASKS.md`

## Purpose

Translate Epic B (MVP-1 Core Recommendation Flow) into executable engineering tasks with clear acceptance criteria, sequencing, and handoff context.

## Current Execution Snapshot (2026-02-18 Session Wrap)

1. What was completed:
- B1 shared contracts scaffold is implemented in `packages/shared-contracts`:
  - recommendation session contracts
  - extraction payload/confirmation contracts
  - confidence/risk + low-confidence signaling validation
- B3 upload-intake scaffold is implemented:
  - MidJourney metadata normalization parser (`scripts/ingestion/midjourney-metadata.js`)
  - extraction persistence migration (`scripts/db/migrations/20260219103000_recommendation_extractions.sql`)
  - repository methods for extraction insert/get/confirm
  - API endpoints scaffolded for extract/get/confirm in `apps/api/src/index.js`
- Contracts build and local migrations passed.

2. Decisions made:
- MVP-1 intake remains upload-only.
- Extraction confirmation is required before final submission.
- Raw extracted metadata is retained for future parser reprocessing.

3. Outstanding risks/issues:
- PNG binary parsing is not yet wired; current extraction endpoint expects normalized metadata field payload input.
- Current ranking is deterministic scaffold logic (rule-based heuristic), not final domain scoring.
- End-to-end HTTP route smoke test for new extraction endpoints was not completed in this sandbox due process port-binding restriction (`EPERM` on `0.0.0.0:3001`).

4. Recommended next task:
- Execute B2 next: add recommendation session/recommendation persistence schema and finalize extraction-confirm -> recommendation-session creation flow.

Smoke runbook reference:
- Local reproducible smoke commands are documented in `README.md` under `Reproducible Smoke Runbook`.

## Current API Examples (Implemented)

Verified against current implementation in:
- `apps/api/src/index.js`
- `scripts/db/repository.js`

Auth:
- All endpoints below require `Authorization: Bearer <jwt>` (except `GET /v1/health`).

### 1) Create recommendation extraction

Endpoint:
- `POST /v1/recommendation-extractions`

Example request:

```json
{
  "metadataFields": [
    {
      "key": "Description",
      "value": "cinematic portrait of a boxer in rain --ar 3:4 --v 6 Job ID: 123e4567-e89b-12d3-a456-426614174000"
    },
    {
      "key": "Author",
      "value": "ryan@example.com"
    },
    {
      "key": "Creation Time",
      "value": "2026-02-18T10:22:00Z"
    }
  ],
  "fileName": "midjourney-output.png",
  "mimeType": "image/png"
}
```

Example `201` response:

```json
{
  "extraction": {
    "extractionId": "rex_3f8bb1d5-03a8-4ac3-9e58-cf8508586c49",
    "status": "extracted",
    "prompt": "cinematic portrait of a boxer in rain --ar 3:4 --v 6",
    "author": "ryan@example.com",
    "creationTime": "2026-02-18T10:22:00Z",
    "sourceJobId": "123e4567-e89b-12d3-a456-426614174000",
    "modelFamily": "standard",
    "modelVersion": "6",
    "modelSelectionSource": "prompt_flag",
    "isBaseline": true,
    "hasProfile": false,
    "hasSref": false,
    "parserVersion": "midjourney-metadata-v1"
  },
  "requiresConfirmation": true
}
```

Example `400` response:

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Extraction parsing failed",
    "requestId": "9f9f26ea-2d7b-44e5-b0cf-697f7f58c1de",
    "details": {
      "reason": "Missing required metadata field: Description"
    }
  }
}
```

### 2) Confirm extraction and create/reuse recommendation session

Endpoint:
- `POST /v1/recommendation-extractions/:extractionId/confirm`

Example request:

```json
{
  "confirmed": true,
  "mode": "precision"
}
```

Example `200` response:

```json
{
  "session": {
    "sessionId": "rs_6f250fef-707f-4a17-9f0e-f5560f9d790f",
    "extractionId": "rex_3f8bb1d5-03a8-4ac3-9e58-cf8508586c49",
    "promptId": "prm_1f357273-3d13-4e9b-87c7-cf643f42d21d",
    "userId": "user-123",
    "mode": "precision",
    "status": "succeeded",
    "createdAt": "2026-02-18T18:12:44.021Z",
    "updatedAt": "2026-02-18T18:12:44.021Z",
    "confirmedAt": "2026-02-18T18:12:43.995Z"
  }
}
```

Example `404` response:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Recommendation extraction not found",
    "requestId": "2e6550b3-fbdf-4853-ad6f-6e4d9845a571",
    "details": null
  }
}
```

### 3) Get extraction details

Endpoint:
- `GET /v1/recommendation-extractions/:extractionId`

Example `200` response:

```json
{
  "extraction": {
    "extractionId": "rex_3f8bb1d5-03a8-4ac3-9e58-cf8508586c49",
    "status": "confirmed",
    "prompt": "cinematic portrait of a boxer in rain --ar 3:4 --v 6",
    "author": "ryan@example.com",
    "creationTime": "2026-02-18T10:22:00Z",
    "sourceJobId": "123e4567-e89b-12d3-a456-426614174000",
    "modelFamily": "standard",
    "modelVersion": "6",
    "modelSelectionSource": "prompt_flag",
    "isBaseline": true,
    "hasProfile": false,
    "hasSref": false,
    "parserVersion": "midjourney-metadata-v1",
    "createdAt": "2026-02-18T18:11:55.678Z",
    "confirmedAt": "2026-02-18T18:12:43.995Z",
    "metadataRaw": [
      {
        "key": "Description",
        "value": "cinematic portrait of a boxer in rain --ar 3:4 --v 6 Job ID: 123e4567-e89b-12d3-a456-426614174000"
      }
    ]
  }
}
```

### 4) Get recommendation session details

Endpoint:
- `GET /v1/recommendation-sessions/:sessionId`

Example `200` response:

```json
{
  "session": {
    "sessionId": "rs_6f250fef-707f-4a17-9f0e-f5560f9d790f",
    "extractionId": "rex_3f8bb1d5-03a8-4ac3-9e58-cf8508586c49",
    "promptId": "prm_1f357273-3d13-4e9b-87c7-cf643f42d21d",
    "mode": "precision",
    "status": "succeeded",
    "userId": "user-123",
    "createdAt": "2026-02-18T18:12:44.021Z",
    "updatedAt": "2026-02-18T18:12:44.021Z",
    "prompt": {
      "promptId": "prm_1f357273-3d13-4e9b-87c7-cf643f42d21d",
      "promptText": "cinematic portrait of a boxer in rain --ar 3:4 --v 6",
      "status": "active",
      "version": "v1",
      "curated": false,
      "createdAt": "2026-02-18T18:12:44.010Z"
    },
    "recommendations": [
      {
        "recommendationId": "rec_0e8ea6d6-3455-4913-89f4-4f61349f801d",
        "rank": 1,
        "combinationId": "combo_street_editorial",
        "rationale": "Precision match for extracted prompt using combination combo_street_editorial.",
        "confidence": 0.717,
        "riskNotes": [],
        "confidenceRisk": {
          "confidence": 0.717,
          "riskNotes": [],
          "lowConfidence": {
            "isLowConfidence": false
          }
        },
        "lowConfidence": {
          "isLowConfidence": false
        },
        "promptImprovements": [
          "Try emphasizing style hints aligned with: p-9d2f sref-7ab1."
        ],
        "createdAt": "2026-02-18T18:12:44.102Z"
      }
    ]
  }
}
```

Example `403` response:

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Recommendation session is not accessible",
    "requestId": "ceef7654-8f2d-4468-8dd1-4bf1d58987a0",
    "details": null
  }
}
```

## Epic B - Core Recommendation Flow (MVP-1)

Objective:
- Deliver upload-to-recommendation flow (MidJourney PNG metadata extraction) with ranked profile/sref combinations, rationale, confidence, risk notes, and prompt improvement guidance.

### Scope

1. Prompt submission and recommendation session model.
1. Upload-first recommendation intake and metadata extraction model.
2. Recommendation mode handling (`precision`, `close_enough`) with agreed thresholds.
3. Style influence retrieval/filtering and ranking.
4. Confidence/risk formatting and low-confidence labeling.
5. Prompt improvement suggestion output.
6. Frontend recommendation page with mode switch and ranked results.

### Out of Scope

1. Post-result feedback upload/alignment logic (Epic C).
2. Admin moderation/governance workflows (Epic D).
3. Backup/restore and launch hardening tracks (Epic E).
4. Render orchestration/integration with external generation platforms.
5. Manual prompt text entry path for MVP-1.

### Constraints

1. Must use Epic A runtime shape (API enqueue boundary preserved where async is required).
2. Recommendation thresholds are fixed for MVP:
- `precision >= 0.65`
- `close enough >= 0.45`
3. Every recommendation must include:
- rationale
- confidence
- risk notes
- prompt improvements
4. Low-confidence outcomes must be explicitly labeled.
5. Model family/version resolution and persistence rules from Epic A remain mandatory.
6. Intake is upload-only for MVP-1:
- user provides MidJourney PNG
- system extracts `Description` prompt and related metadata
- no manual prompt text entry in MVP-1 flow
7. Confirmation gate is required:
- user must confirm extracted metadata before recommendation submission finalization
8. Raw extracted metadata must be retained for future parser reprocessing.

## Task Breakdown

## B1. Recommendation Domain Contracts

Description:
- Define shared contract shapes for recommendation input/output and session status.

Implementation tasks:
1. Add shared contracts for:
- recommendation submit payload
- recommendation session envelope
- recommendation item structure
- confidence/risk block shape
- low-confidence signaling shape
2. Add schema/version constants and validation for these contracts.
3. Ensure API and frontend consume the same contract exports.

Acceptance criteria:
1. Shared contract package exports recommendation flow contracts.
2. API and frontend compile against shared contract types/shapes.
3. Invalid payloads fail with stable `api-error` contract.

## B2. Persistence and Migration for Recommendation Entities

Description:
- Add relational persistence for prompt/session/recommendation records used by MVP-1.

Implementation tasks:
1. Add migration(s) for minimum Epic B entities:
- `prompts` (or equivalent prompt input table)
- `recommendation_sessions`
- `recommendations`
2. Add indexes for hot paths:
- session lookup by user/time
- recommendations by session/rank
3. Add repository access methods for create/list/get flows.

Acceptance criteria:
1. Migrations apply cleanly from zero state and existing Epic A state.
2. Session and recommendation records persist and are queryable.
3. API returns persisted recommendation data after submission.

## B3. Upload Intake and Metadata Normalization

Description:
- Convert uploaded MidJourney PNG metadata into normalized recommendation requests.

Implementation tasks:
1. Implement upload intake endpoint and parser flow for PNG metadata extraction.
2. Parse and normalize metadata fields:
- `Description` -> prompt text
- `Author`
- `Creation Time`
- `Job ID` (from metadata text/XMP GUID when present)
3. Classify baseline vs influenced input:
- baseline when no `--profile` and no `--sref`
4. Normalize mode values to canonical enum.
2. Reuse Epic A model resolution rules:
- respect explicit `--v` and `--niji`
- apply default standard version when absent
5. Persist normalized prompt/session metadata and raw extraction blob for auditability.
6. Add extraction review payload to support required confirmation step.

Acceptance criteria:
1. Upload intake validates and normalizes consistently.
2. Explicit and default model resolution behavior is preserved.
3. Invalid combinations (for example both `--v` and `--niji`) return clear errors.
4. Missing/invalid required metadata returns actionable parse errors.
5. Submission cannot finalize without explicit confirmation flag.

## B4. Style Influence Retrieval and Eligibility Filtering

Description:
- Build candidate retrieval pipeline for ranking.

Implementation tasks:
1. Load active influences and combinations from persistence layer.
2. Apply governance eligibility filters (active/enabled only).
3. Add deterministic fallback behavior when candidate pool is sparse.
4. Add lightweight caching for read-heavy lookup paths.

Acceptance criteria:
1. Candidate retrieval excludes disabled/ineligible influences.
2. Empty/sparse candidate sets return safe, explainable behavior.
3. Retrieval path is deterministic for same inputs.

## B5. Ranking Engine and Mode Threshold Policy

Description:
- Implement recommendation scoring/ranking with mode-aware thresholds.

Implementation tasks:
1. Implement ranking pipeline that outputs ordered candidates.
2. Enforce threshold rules per mode:
- `precision >= 0.65`
- `close_enough >= 0.45`
3. Label below-threshold results as low-confidence.
4. Return confidence score per recommendation item.

Acceptance criteria:
1. Mode thresholds are enforced exactly.
2. Ranking output is stable and sorted by score/rank rules.
3. Low-confidence labeling is present and explicit.

## B6. Rationale, Risk Notes, and Prompt Improvements

Description:
- Generate transparent explanation payloads required for trust and actionability.

Implementation tasks:
1. Add rationale generation logic per recommendation.
2. Add risk note generation for likely failure modes/mismatch areas.
3. Add prompt improvement suggestions tied to each recommendation.
4. Ensure response contract always includes these fields.

Acceptance criteria:
1. Each recommendation includes rationale + risk + prompt improvements.
2. Missing-explanation responses are rejected in API assembly.
3. Explanations are deterministic for same scoring inputs.

## B7. API Endpoints for Recommendation Flow

Description:
- Expose recommendation flow through versioned REST endpoints.

Implementation tasks:
1. Add upload submit endpoint for recommendation session creation from extracted metadata.
2. Add extraction confirmation endpoint/state transition to finalize recommendation submission.
3. Add session detail endpoint for ranked recommendation retrieval.
4. Add request correlation + structured logs for session operations.
5. Ensure auth/role checks remain consistent with Epic A middleware.

Acceptance criteria:
1. Authenticated user can upload MidJourney PNG and receive session result.
2. Recommendation submission finalizes only after explicit extraction confirmation.
3. API returns ranked recommendations with required explanation fields.
4. Logs include `request_id` and recommendation session identifiers.

## B8. Frontend MVP-1 Recommendation Page

Description:
- Deliver first usable UI for upload-to-recommendation interaction.

Implementation tasks:
1. Build page with:
- PNG upload input
- mode switch (`precision`, `close enough`)
- submit action
2. Add extraction review step showing parsed metadata before final submission.
3. Require explicit user confirmation action to continue.
4. Render ranked recommendation cards with:
- confidence
- rationale
- risk notes
- prompt improvements
5. Handle empty/low-confidence states explicitly.
6. Wire to API via agreed frontend data-fetch approach.

Acceptance criteria:
1. End user can complete upload-to-recommendation flow in one session.
2. UI requires confirmation of extracted metadata before final submission.
3. UI clearly surfaces mode and confidence context.
4. Low-confidence output is visibly distinguished.

## B9. Verification and Handoff

Description:
- Validate Epic B completion criteria and document residual risks.

Implementation tasks:
1. Add backend tests for:
- threshold enforcement
- ranking ordering
- low-confidence behavior
- response-shape guarantees
2. Add minimal frontend tests for critical form/submit/result path.
3. Run smoke flow from prompt submit to rendered results.
4. Document known gaps for Epic C/D/E.

Acceptance criteria:
1. Epic B done criteria from implementation plan are demonstrably met.
2. Smoke path is reproducible from clean checkout.
3. Remaining follow-ups are explicitly documented.

## Epic B Done Checklist

1. User completes recommendation flow in one session.
2. Recommendations include rationale, confidence, risk notes, and prompt improvements.
3. Mode thresholds are enforced (`precision >= 0.65`, `close_enough >= 0.45`).
4. Low-confidence behavior is explicitly labeled in API and UI.
5. Frontend page supports mode switch and ranked result rendering.
6. Confirmation gate is enforced before recommendation finalization.
7. Raw extracted metadata is retained and linked to recommendation session.

## Suggested Execution Sequence

1. B1 Recommendation Domain Contracts
2. B2 Persistence and Migration for Recommendation Entities
3. B3 Prompt Intake and Normalization
4. B4 Style Influence Retrieval and Eligibility Filtering
5. B5 Ranking Engine and Mode Threshold Policy
6. B6 Rationale, Risk Notes, and Prompt Improvements
7. B7 API Endpoints for Recommendation Flow
8. B8 Frontend MVP-1 Recommendation Page
9. B9 Verification and Handoff

## Risks and Controls

1. Risk: Threshold logic drifts from agreed policy.
Control: encode thresholds as single-source constants + targeted tests.

2. Risk: Candidate scarcity yields unusable output.
Control: explicit sparse-pool fallback and clear user-facing messaging.

3. Risk: Explanations become inconsistent with scores.
Control: enforce response assembly contract with validation + tests.

4. Risk: UI presents confidence without sufficient caveats.
Control: mandatory low-confidence labels and risk-note rendering.

5. Risk: Metadata extraction inconsistency across PNG variants.
Control: deterministic parser rules + fixture coverage for known MidJourney metadata patterns.

6. Risk: Required confirmation adds user friction.
Control: keep review UI concise, pre-filled, and one-step confirmation.

## Next Active Task

1. Start B1 by defining shared recommendation contracts and version exports.
