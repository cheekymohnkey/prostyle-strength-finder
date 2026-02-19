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
4. Open `http://127.0.0.1:3000` and execute extraction -> confirm -> session retrieval in the page.

## A6 Stub Flow Verification

1. Start API and submit analysis job at `POST /v1/analysis-jobs`.
2. Capture returned job fields (`jobId`, `idempotencyKey`, `runType`, `imageId`).
3. Run worker with local queue mode (`QUEUE_ADAPTER_MODE=sqlite`) and verify lifecycle logs: `in_progress` -> `succeeded`.

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
