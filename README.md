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
- `design-documenatation/IMPLEMENTATION_TASKS.md`
- `design-documenatation/ENVIRONMENT_CONFIGURATION_CONTRACT.md`

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
7. Run frontend bootstrap check:
   `npm run frontend`

## Storage Smoke Check

With env loaded from `.env.local.example`, run:

`npm run storage:smoke`

This validates storage adapter `put/get/delete` behavior using local pre-prod storage mode.

## A6 Stub Flow Verification

1. Start API and submit analysis job at `POST /v1/analysis-jobs`.
2. Capture returned job fields (`jobId`, `idempotencyKey`, `runType`, `imageId`).
3. Pass those values into worker sample queue payload using `WORKER_SAMPLE_MESSAGES`.
4. Run worker and verify lifecycle logs: `in_progress` -> `succeeded`.
