# Prostyle Strength Finder - Implementation Tasks

Status: Draft for execution  
Date: 2026-02-18  
Depends on:
- `design-documenatation/DECISIONS.md`
- `design-documenatation/ARCHITECTURE_AND_ERD.md`
- `design-documenatation/TECHNICAL_DECISIONS.md`
- `design-documenatation/MVP_PATH.md`
- `design-documenatation/IMPLEMENTATION_PLAN.md`

## Purpose

Translate Implementation Epic A into concrete, executable engineering tasks with acceptance criteria and sequencing.

## Epic A - Platform Foundation

Objective:
- Establish repository baseline and environment configuration contract required for all subsequent MVP epics.

### Scope

1. Repository structure for API, worker, frontend, shared contracts.
2. Environment configuration contract (`local`, `staging`, `prod`) with parity by key names.

### Out of Scope

1. Core recommendation behavior (ranking, rationale generation, thresholds in runtime logic).
2. Feedback-loop implementation (post-result alignment and weighting logic).
3. Admin/contributor full UI flows and governance features.
4. Production hardening tasks (backup drills, full observability dashboards, launch gates).
5. Render orchestration/integration with external generation platforms.

### Constraints

1. Runtime shape must remain modular monolith + separate worker process.
2. Async processing boundary must be preserved (API enqueues, worker executes).
3. SQLite is MVP system of record; migration workflow is mandatory from day 1.
4. Queue integration contract must support retry/backoff/dead-letter lifecycle.
5. Shared contracts must be versioned and reusable by at least API + frontend, and preferably API + worker.
6. Env parity rule is mandatory across `local`, `staging`, `prod`:
- same variable names
- same adapter interfaces
- values vary by environment only

## Task Breakdown

## A1. Repository Skeleton

Description:
- Create the monorepo folder layout and ownership boundaries for API, worker, frontend, and shared contracts.

Implementation tasks:
1. Create root folders:
- `apps/api`
- `apps/worker`
- `apps/frontend`
- `packages/shared-contracts`
- `infra` (optional infra/config docs and scripts)
- `scripts` (project automation scripts)
2. Add root-level docs:
- `README.md` update with workspace overview and startup flows.
- `docs` pointer to architecture and implementation plan.
3. Add baseline tooling config (workspace, lint/format/test command stubs).

Acceptance criteria:
1. Folder structure exists and is committed.
2. Each app/package has a minimal README describing responsibility.
3. Workspace scripts can run target-specific commands (`api`, `worker`, `frontend`).

## A2. Shared Contracts Package

Description:
- Define shared type/schema contracts for cross-process communication and UI/API integration.

Implementation tasks:
1. Create contract modules:
- `analysis-job` (enqueue payload, idempotency key, priority/context)
- `analysis-run` (status envelope, timestamps, error contract)
- `recommendation-result` (shape for downstream use)
- `api-error` (stable error response format)
2. Add schema version constants and export surface.
3. Add validation strategy (runtime schema validation where needed).
4. Add package build step and import path aliases.

Acceptance criteria:
1. API and frontend import at least one shared contract.
2. Worker imports job envelope contract for queue message decode.
3. Contract package has a clear semantic version field or version constants.

## A3. SQLite Setup + Migration Framework

Description:
- Establish SQLite as MVP system of record with a repeatable migration workflow from zero state.

Implementation tasks:
1. Define DB location strategy for each environment (`local`, `staging`, `prod`) via `DATABASE_URL`.
2. Add migration framework scaffolding and command entrypoints:
- create migration
- apply migrations
- rollback last migration (where supported)
3. Create initial baseline schema migration for Epic A entities needed by API/worker scaffolding.
4. Add migration-state tracking table/versioning convention.
5. Add startup safety check to verify DB is reachable and schema version is current.
6. Add developer reset/bootstrap script for clean local DB initialization.

Acceptance criteria:
1. New environment can apply migrations from zero state without manual SQL steps.
2. Migration state is trackable and deterministic across runs.
3. API and worker can both connect using `DATABASE_URL` with successful startup check.
4. Baseline migration path is documented and executable locally.

## A4. API Baseline

Description:
- Scaffold versioned REST API with protected route capability and async analysis submission surface.

Implementation tasks:
1. Initialize API app scaffold with:
- `/v1/health`
- `/v1/analysis-jobs` (submit)
- `/v1/analysis-jobs/:id` (status)
2. Add request correlation middleware (`request_id`).
3. Add auth middleware skeleton for Cognito JWT validation.
4. Add job submission idempotency key handling scaffold.
5. Add structured logging baseline (JSON logs).

Acceptance criteria:
1. API process runs locally.
2. Health endpoint responds.
3. Protected endpoint path exists and validates token shape (or guarded stub).
4. Submit/status endpoints compile and use shared contracts.

## A5. Worker Baseline

Description:
- Scaffold independent worker process that consumes queue messages and updates run state.

Implementation tasks:
1. Initialize worker process bootstrapping and graceful shutdown.
2. Add queue polling + message parse using shared contract schemas.
3. Add run lifecycle status transitions:
- `queued` -> `in_progress` -> `succeeded`
- failure path with retry metadata and dead-letter handoff fields
4. Add idempotency guard hook (existing run detection scaffold).
5. Add structured logging with `job_id` and `analysis_run_id`.

Acceptance criteria:
1. Worker process runs locally independent of API.
2. Worker can consume test payload and log lifecycle transitions.
3. Failed job path records retry-relevant metadata.

## A6. Environment Configuration Contract

Description:
- Define strict environment-variable contract used consistently by API, worker, frontend across environments.

Implementation tasks:
1. Create config spec document with:
- variable name
- owner component(s)
- required/optional
- allowed formats
- local default guidance
2. Create env templates:
- `.env.local.example`
- `.env.staging.example`
- `.env.prod.example`
3. Implement config loader + validation in API and worker.
4. Implement frontend config mapping for public API base URL.
5. Add startup fail-fast on missing required keys.

Required config domains:
1. Runtime:
- `NODE_ENV`, `APP_ENV`, `PORT`
2. Database:
- `DATABASE_URL` (SQLite path for MVP)
3. Queue:
- `SQS_QUEUE_URL`, `SQS_DLQ_URL`, retry/backoff settings
4. Storage:
- `S3_BUCKET`, `AWS_REGION`, optional endpoint override for local simulation
5. Auth:
- `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, JWT issuer/audience
6. Observability:
- log level, service name, correlation toggles
7. Frontend:
- `NEXT_PUBLIC_API_BASE_URL`

Acceptance criteria:
1. All services use one documented contract.
2. API and worker refuse startup with missing required variables.
3. Local templates are sufficient to boot all services in local pre-prod mode.

## A7. Verification and Handoff

Description:
- Validate that baseline architecture is operational and ready for Epic B dependencies.

Implementation tasks:
1. Run local startup check for all processes.
2. Validate basic API enqueue -> worker consume path using stub payload.
3. Validate shared contract reuse by imports in multiple apps.
4. Document quickstart steps in root README.

Acceptance criteria:
1. End-to-end local foundation path is reproducible from clean checkout.
2. Known gaps are documented explicitly as Epic B+ follow-ups.
3. Epic A done checklist is fully satisfied.

## Epic A Done Checklist

1. Repository has agreed baseline structure for API, worker, frontend, shared contracts.
2. Env contract document exists and includes required/optional keys with format notes.
3. Env templates exist for `local`, `staging`, `prod`.
4. API and worker boot locally with validated config.
5. Frontend bootstraps and targets configured API URL.
6. Shared contracts are consumed by multiple components.
7. Async job submission and worker consumption path is verifiable locally (stub flow acceptable).

## Suggested Execution Sequence

1. A1 Repository Skeleton
2. A6 Environment Configuration Contract (early to prevent drift)
3. A2 Shared Contracts Package
4. A3 SQLite Setup + Migration Framework
5. A4 API Baseline
6. A5 Worker Baseline
7. A7 Verification and Handoff

## Notes

1. This task set intentionally excludes deep feature logic from MVP-1/MVP-2/MVP-3.
2. If any Epic A task implies schema or infrastructure lock-in beyond agreed decisions, update `DECISIONS.md` first before implementation.

## A3 Implementation Results (2026-02-18)

Implementation summary:
1. SQLite migration framework added under `scripts/db` with commands:
- `db:migrate`
- `db:status`
- `db:create`
- `db:rollback`
- `db:reset`
2. Baseline migration created:
- `scripts/db/migrations/20260218130000_epic_a_baseline.sql`
3. Migration state tracking table implemented:
- `schema_migrations`
4. API and worker startup DB readiness checks added:
- verifies DB connectivity
- fails startup when migrations are pending
5. Local quickstart updated to include migration application before service startup.

Acceptance criteria mapping:
1. Zero-state migration application: complete (`npm run db:migrate`).
2. Deterministic migration state tracking: complete (`npm run db:status`).
3. API/worker startup DB readiness check: complete.
4. Baseline migration documented and executable locally: complete.

Known A3 follow-ups (Epic B+):
1. Migration runner is SQLite-only by design for MVP; Postgres portability layer remains future work.
2. Rollback safety is migration-author responsibility (`-- migrate:down` content quality).

## A4 Implementation Results (2026-02-18)

Implementation summary:
1. API baseline endpoints implemented:
- `GET /v1/health`
- `POST /v1/analysis-jobs`
- `GET /v1/analysis-jobs/:id`
2. Request correlation handling added:
- incoming `x-request-id` passthrough or generated UUID
- response header includes `x-request-id`
3. Auth skeleton added:
- bearer token required
- JWT structure check (`header.payload.signature`)
- issuer/audience checks against configured Cognito values
4. Idempotency submission behavior added:
- duplicate `idempotencyKey` returns existing job (`reused: true`)
5. Structured JSON logging added for:
- request receipt
- enqueue event
- server startup

Acceptance criteria mapping:
1. API process runs locally: complete.
2. Health endpoint responds: complete (`200` observed).
3. Protected endpoint validates token shape: complete (`401` without valid bearer/JWT shape).
4. Submit/status compile and use shared contracts: complete (job envelope and API error shape use shared-contracts package).

Known A4 follow-ups (Epic B+):
1. JWT signature/JWKS verification is not yet implemented.
2. Job persistence is in-memory and resets on restart.
3. Queue handoff is scaffolded at API contract level; real SQS integration pending.

## A7 Verification Results (2026-02-18)

Execution summary:
1. `npm run contracts`: passed.
2. `npm run api`: passed (server startup + endpoint checks).
3. `npm run worker`: passed (independent startup/shutdown and lifecycle logging).
4. `npm run frontend`: passed (config mapping and contract usage check).
5. Stubbed API enqueue -> worker consume path: passed.

Epic A done checklist status:
1. Repository baseline structure: complete.
2. Environment contract document: complete.
3. Env templates (`local`, `staging`, `prod`): complete.
4. API + worker local boot with validated config: complete.
5. Frontend bootstrap + configured API URL: complete.
6. Shared contracts consumed across components: complete.
7. Async submission -> worker consumption verifiable via stub flow: complete.

Known gaps (Epic B+ follow-ups):
1. API and worker startup now validate SQLite readiness, but job/run writes are still in-memory scaffolds.
2. Worker queue adapter is local simulation, not yet wired to AWS SQS client implementation.
3. API auth is JWT shape + issuer/audience scaffold only; signature verification/JWKS integration is pending.
4. API job state is in-memory and reset on restart; durable run tracking is pending data-layer implementation.
