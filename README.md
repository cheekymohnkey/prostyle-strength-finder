# Prostyle Strength Finder

Repository for the Prostyle Strength Finder MVP.

## Workspace Layout

- `apps/api`: Versioned REST API and application-layer orchestration entrypoint.
- `apps/worker`: Async analysis worker process.
- `apps/frontend`: User-facing web application.
- `packages/shared-contracts`: Shared API/job contract definitions and schema versions.
- `infra`: Infrastructure notes and deployment/environment scaffolding.
- `scripts`: Project automation and development scripts.
- `design-documenatation`: Source-of-truth product and technical documentation.

## Documentation

Primary design and planning docs:

- `design-documenatation/DECISIONS.md`
- `design-documenatation/ARCHITECTURE_AND_ERD.md`
- `design-documenatation/TECHNICAL_DECISIONS.md`
- `design-documenatation/MVP_PATH.md`
- `design-documenatation/IMPLEMENTATION_PLAN.md`
- `design-documenatation/EPIC_A_IMPLEMENTATION_TASKS.md`
- `design-documenatation/EPIC_B_IMPLEMENTATION_TASKS.md`
- `design-documenatation/ENVIRONMENT_CONFIGURATION_CONTRACT.md`

## Environment Set

Supported environments for the current phase:
- `local`
- `uat`
- `prod`

Policy:
- Only two non-local environments are in scope right now: `uat` and `prod`.

## Current Infra State (2026-02-18)

1. Terraform IaC for non-local storage/queue is implemented under `infra/terraform`.
2. UAT and prod stacks have been applied successfully.
3. Live AWS smoke checks passed for both environments:
- S3: put/head/get/delete
- SQS: send/receive/delete

## Local Quickstart

1. Ensure Node.js 20 is installed and on `PATH`.
2. Export environment variables from local template:
   `set -a && source .env.local.example && set +a`
3. Apply database migrations:
   `npm run db:migrate`
4. Run shared-contracts build check:
   `npm run contracts`
5. Run API:
   `npm run api`
6. Run worker:
   `npm run worker`
7. Run frontend server:
   `npm run frontend`
8. Open frontend flow page:
   `http://127.0.0.1:3000`

Local auth note:
- `.env.local.example` uses `AUTH_JWT_VERIFICATION_MODE=insecure` for local token testing only.
- non-local environments should use `AUTH_JWT_VERIFICATION_MODE=jwks`.

## Storage Smoke Check

With env loaded from `.env.local.example`, run:

`npm run storage:smoke`

This validates storage adapter `put/get/delete` behavior using local pre-prod storage mode.

## Reproducible Smoke Runbook

Use this sequence for a repeatable local pre-prod verification.

1. Load local env:
   `set -a && source .env.local.example && set +a`
2. Reset DB to a known state:
   `npm run db:reset`
3. Run recommendation backend smoke (seeds data and validates extraction -> confirm -> session):
   `npm run recommendation:smoke`

For manual UI verification of the same flow:

1. Terminal A: `npm run api`
2. Terminal B: `npm run worker`
3. Terminal C: `npm run frontend`
4. Open `http://127.0.0.1:3000`, upload a MidJourney PNG, then execute extraction -> confirm -> session retrieval.

Frontend upload note:
- The page now sends `POST /api/recommendation-extractions/upload` with `{ fileName, mimeType, fileBase64 }`.
- Frontend server parses PNG metadata into normalized `metadataFields` and forwards to `POST /v1/recommendation-extractions`.
- Required normalized field remains `Description`; optional fields are `Author`, `Creation Time`, and `Job ID`.

Troubleshooting:
1. If extraction fails with `Missing required metadata field: Description`, the PNG likely lacks readable MidJourney prompt metadata chunks (`tEXt`, `zTXt`, `iTXt`, or XMP payload).
2. If upload fails with `Uploaded file is not a PNG`, verify extension and binary type match (`image/png`).
3. Re-run `npm run recommendation:smoke` to verify parser + threshold/flow behavior (output includes `pngFixture.path`).

## A6 Stub Flow Verification

1. Start API and submit analysis job at `POST /v1/analysis-jobs`.
2. Capture returned job fields (`jobId`, `idempotencyKey`, `runType`, `imageId`).
3. Run worker with local queue mode (`QUEUE_ADAPTER_MODE=sqlite`) and verify lifecycle logs: `in_progress` -> `succeeded`.
4. Fetch trait result for completed trait jobs at `GET /v1/analysis-jobs/:jobId/result`.

Trait extraction smoke:

1. `set -a && source .env.local.example && set +a`
2. `npm run db:reset`
3. `npm run trait:smoke`

Trait inference mode switch:

1. Deterministic (default): `TRAIT_INFERENCE_MODE=deterministic`
2. LLM-backed: set `TRAIT_INFERENCE_MODE=llm` and `OPENAI_API_KEY=<your-key>`
3. Editable LLM system prompt: `scripts/inference/prompts/trait-system.md`

Admin governance smoke:

1. `set -a && source .env.local.example && set +a`
2. `npm run db:reset`
3. `npm run admin:governance-smoke`

Admin moderation smoke:

1. `set -a && source .env.local.example && set +a`
2. `npm run db:reset`
3. `npm run admin:moderation-smoke`

Admin prompt curation smoke:

1. `set -a && source .env.local.example && set +a`
2. `npm run db:reset`
3. `npm run admin:prompt-curation-smoke`

Admin approval policy smoke:

1. `set -a && source .env.local.example && set +a`
2. `npm run db:reset`
3. `npm run admin:approval-policy-smoke`

Admin governance endpoints:

1. `POST /v1/admin/style-influences/:styleInfluenceId/governance`
2. `GET /v1/admin/style-influences/:styleInfluenceId/audit`

Admin analysis moderation endpoints:

1. `POST /v1/admin/analysis-jobs/:jobId/moderation`
2. `GET /v1/admin/analysis-jobs/:jobId/moderation`

Admin prompt curation endpoints:

1. `POST /v1/admin/prompts/:promptId/curation`
2. `GET /v1/admin/prompts/:promptId/curation`

Admin approval policy endpoints:

1. `GET /v1/admin/approval-policy`
2. `POST /v1/admin/approval-policy`
3. `GET /v1/admin/analysis-jobs/:jobId/approval`
4. `POST /v1/admin/analysis-jobs/:jobId/approval`

## Recommendation API Quick Reference

All endpoints below require:
- `Authorization: Bearer <jwt>`

Full examples and context:
- `design-documenatation/EPIC_B_IMPLEMENTATION_TASKS.md`

### 1) Create extraction

- `POST /v1/recommendation-extractions`

Request (example):

```json
{
  "metadataFields": [
    {
      "key": "Description",
      "value": "cinematic portrait in rain --ar 3:4 --v 6 Job ID: 123e4567-e89b-12d3-a456-426614174000"
    }
  ]
}
```

Response (`201`) shape:

```json
{
  "extraction": {
    "extractionId": "rex_<uuid>",
    "status": "extracted",
    "prompt": "cinematic portrait in rain --ar 3:4 --v 6"
  },
  "requiresConfirmation": true
}
```

### 2) Confirm extraction

- `POST /v1/recommendation-extractions/:extractionId/confirm`

Request (example):

```json
{
  "confirmed": true,
  "mode": "precision"
}
```

Response (`200`) shape:

```json
{
  "session": {
    "sessionId": "rs_<uuid>",
    "extractionId": "rex_<uuid>",
    "mode": "precision",
    "status": "succeeded"
  }
}
```

### 3) Get extraction

- `GET /v1/recommendation-extractions/:extractionId`

Response (`200`) shape:

```json
{
  "extraction": {
    "extractionId": "rex_<uuid>",
    "status": "confirmed",
    "prompt": "<normalized_prompt>"
  }
}
```

### 4) Get recommendation session

- `GET /v1/recommendation-sessions/:sessionId`

Response (`200`) shape:

```json
{
  "session": {
    "sessionId": "rs_<uuid>",
    "mode": "precision",
    "status": "succeeded",
    "prompt": {
      "promptId": "prm_<uuid>",
      "promptText": "<normalized_prompt>"
    },
    "recommendations": [
      {
        "recommendationId": "rec_<uuid>",
        "rank": 1,
        "combinationId": "<combination_id>",
        "confidence": 0.7,
        "lowConfidence": {
          "isLowConfidence": false
        }
      }
    ]
  }
}
```

## Feedback API Quick Reference (Epic C Step 2)

All endpoints below require:
- `Authorization: Bearer <jwt>`

### 1) Upload generated image

- `POST /v1/generated-images`

Request (example):

```json
{
  "recommendationSessionId": "rs_<uuid>",
  "fileName": "my-result.png",
  "mimeType": "image/png",
  "fileBase64": "<base64-image-bytes>"
}
```

Response (`201`) shape:

```json
{
  "generatedImage": {
    "generatedImageId": "img_<uuid>",
    "recommendationSessionId": "rs_<uuid>",
    "storageUri": "local://...",
    "mimeType": "image/png",
    "sizeBytes": 12345
  }
}
```

### 2) Submit post-result feedback + alignment

- `POST /v1/post-result-feedback`

Request (image + emoji example):

```json
{
  "recommendationSessionId": "rs_<uuid>",
  "recommendationId": "rec_<uuid>",
  "generatedImageId": "img_<uuid>",
  "emojiRating": "🙂",
  "usefulFlag": true,
  "comments": "Strong match to expected mood."
}
```

### 3) Get one feedback record + alignment

- `GET /v1/post-result-feedback/:feedbackId`

### 4) List session feedback records

- `GET /v1/recommendation-sessions/:sessionId/post-result-feedback`

Response (`201`) shape:

```json
{
  "feedback": {
    "feedbackId": "fb_<uuid>",
    "evidenceStrength": "normal"
  },
  "alignment": {
    "alignmentEvaluationId": "ae_<uuid>",
    "alignmentScore": 0.85,
    "confidenceDelta": 0.12
  }
}
```

## Feedback Service Smoke

Use this sequence for reproducible Epic C Step 2 verification:

1. `set -a && source .env.local.example && set +a`
2. `npm run db:reset`
3. `npm run feedback:service-smoke`

Expected signal:
- `image + emoji` yields `evidenceStrength: "normal"` with larger bounded delta.
- `emoji-only` yields `evidenceStrength: "minor"` with smaller bounded delta.

## Frontend Feedback Proxy Smoke

Use this sequence to validate frontend -> API feedback proxy routes:

1. `set -a && source .env.local.example && set +a`
2. `npm run feedback:frontend-proxy-smoke`

Expected signal:
- smoke returns `ok: true` with generated-image upload, feedback submit, and feedback retrieval/list via frontend `/api/*` proxy routes.
