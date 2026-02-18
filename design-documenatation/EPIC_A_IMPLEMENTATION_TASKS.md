# Prostyle Strength Finder - Epic A Implementation Tasks

Status: In execution (Epic A complete; Epic B pending)  
Date: 2026-02-18  
Depends on:
- `design-documenatation/DECISIONS.md`
- `design-documenatation/ARCHITECTURE_AND_ERD.md`
- `design-documenatation/TECHNICAL_DECISIONS.md`
- `design-documenatation/MVP_PATH.md`
- `design-documenatation/IMPLEMENTATION_PLAN.md`

## Purpose

Translate Implementation Epic A into concrete, executable engineering tasks with acceptance criteria and sequencing.

## Current Execution Snapshot (2026-02-18)

1. Epic A implementation tasks A1-A8 are complete.
2. Follow-up tasks for persistence, queue adapter integration, JWT JWKS verification, and real S3 operations are complete.
3. Terraform IaC for non-local storage/queue foundations (`uat`, `prod`) is complete and applied.
4. Live AWS smoke checks have passed in both non-local environments:
- S3: put/head/get/delete
- SQS: send/receive/delete
5. Environment templates now standardize on:
- `.env.local.example`
- `.env.uat.example`
- `.env.prod.example`
6. Next execution focus:
- Epic B (MVP-1 Core Recommendation Flow) and first vertical-slice completion criteria from `design-documenatation/IMPLEMENTATION_PLAN.md`.

## Epic A - Platform Foundation

Objective:
- Establish repository baseline and environment configuration contract required for all subsequent MVP epics.

### Scope

1. Repository structure for API, worker, frontend, shared contracts.
2. Environment configuration contract (`local`, `uat`, `prod`) with parity by key names.
3. Storage adapter plan and implementation path for S3-backed artifact storage.

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
6. Env parity rule is mandatory across `local`, `uat`, `prod`:
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
1. Define DB location strategy for each environment (`local`, `uat`, `prod`) via `DATABASE_URL`.
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
- `.env.uat.example`
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

## A8. S3 Storage Adapter + Bucket Structure Conventions

Description:
- Add an S3-backed storage adapter abstraction and define bucket/key conventions for image and artifact storage.

Implementation tasks:
1. Define storage adapter interface in application/infrastructure boundary:
- `putObject`
- `getObject`
- `deleteObject`
- `getSignedUploadUrl` (if needed by frontend upload flow)
- `getSignedReadUrl` (if needed for controlled retrieval)
2. Implement `S3StorageAdapter` with real AWS-backed operations and environment-driven config:
- bucket name from `S3_BUCKET`
- region from `AWS_REGION`
- optional endpoint override for local simulation via `S3_ENDPOINT_OVERRIDE`
3. Define key namespace conventions (prefix contract):
- `baseline/`
- `generated/`
- `reference/`
- `uploads/`
- `analysis-artifacts/`
4. Add content metadata conventions:
- content type
- source type
- uploader/owner ID
- created timestamp
5. Add error mapping and retry behavior for transient S3 failures.
6. Add local verification script or smoke command for put/get/delete flow.
7. Document operational guardrails:
- bucket separation by environment
- least-privilege IAM policy expectations
- lifecycle/retention default recommendations

Acceptance criteria:
1. API/worker can call one storage adapter interface without direct S3 SDK coupling in domain code.
2. Upload and retrieval paths work in local pre-prod mode (via endpoint override or isolated dev bucket).
3. Key naming convention is documented and consistently applied.
4. Errors from storage operations are surfaced in a stable application error shape.
5. README/docs include setup and verification instructions for storage path.

## Epic A Done Checklist

1. Repository has agreed baseline structure for API, worker, frontend, shared contracts.
2. Env contract document exists and includes required/optional keys with format notes.
3. Env templates exist for `local`, `uat`, `prod`.
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
8. A8 S3 Storage Adapter + Bucket Structure Conventions

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
3. Env templates (`local`, `uat`, `prod`): complete.
4. API + worker local boot with validated config: complete.
5. Frontend bootstrap + configured API URL: complete.
6. Shared contracts consumed across components: complete.
7. Async submission -> worker consumption verifiable via stub flow: complete.

Known gaps (Epic B+ follow-ups):
1. Queue adapter integration exists (sqlite local + SQS mode), but production-hardening for SQS operational concerns is still pending.

## A8 Implementation Results (2026-02-18)

Implementation summary:
1. Added shared storage adapter package:
- `packages/storage-adapter/src/index.js`
- `packages/storage-adapter/src/local-disk-adapter.js`
- `packages/storage-adapter/src/s3-adapter.js`
- `packages/storage-adapter/src/key-conventions.js`
2. Enforced key prefix contract:
- `baseline/`
- `generated/`
- `reference/`
- `uploads/`
- `analysis-artifacts/`
3. Wired API and worker startup storage readiness checks.
4. Added local smoke script:
- `npm run storage:smoke`
5. Added storage conventions doc:
- `infra/S3_BUCKET_CONVENTIONS.md`

Acceptance criteria mapping:
1. Shared adapter interface consumed by API/worker: complete.
2. Local pre-prod put/get/delete path: complete (`storage:smoke`).
3. Key naming conventions documented + enforced: complete.
4. Stable storage error object (`StorageAdapterError`) provided: complete.
5. Setup and verification docs added: complete.

Known A8 follow-ups (Epic B+):
1. Production credentialing and bucket-policy rollout validation is required before launch.
2. Optional future optimization: move from AWS CLI-backed adapter to direct AWS SDK integration if/when needed.

## Follow-up 2 Completion - Queue Adapter Integration (2026-02-18)

Objective:
- Replace process-local queue simulation with shared adapter wiring between API enqueue and worker consumption.

Implementation summary:
1. Added queue adapter module:
- `scripts/queue/adapter.js`
2. Added queue backend migration for local durable queue:
- `scripts/db/migrations/20260218133000_queue_messages.sql`
3. API now enqueues submitted jobs through shared queue adapter.
4. Worker now polls/acks/requeues/dead-letters through shared queue adapter.
5. Queue adapter modes:
- `sqlite` for local reproducible execution
- `sqs` using AWS CLI-backed SQS operations for non-local integration path
6. Added environment control:
- `QUEUE_ADAPTER_MODE`

Verification evidence:
1. DB reset applied both baseline + queue migrations.
2. API job submission enqueued successfully (`202`).
3. Worker consumed queued message and persisted run lifecycle.
4. API status reflected post-worker persisted `succeeded` state.

Impact on previously documented gaps:
1. Gap resolved:
- API and worker are now wired through one queue adapter abstraction, with local durable queue and SQS mode support.
2. Remaining queue-related follow-up:
- production SQS hardening (credentials strategy, telemetry, and failure-playbook coverage) remains for launch readiness.

## Follow-up 3 Completion - JWT Signature Verification via JWKS (2026-02-18)

Objective:
- Replace JWT shape-only checks with signature-aware verification against Cognito JWKS.

Implementation summary:
1. Added auth verifier module:
- `scripts/auth/jwt.js`
2. Verification modes added:
- `jwks` (default non-local): fetch/caches JWKS and verifies RS256 signatures using `kid`
- `insecure` (local-only): validates issuer/audience/time claims without signature verification
3. API auth middleware now uses verifier module instead of shape-only parsing.
4. Added config/env contract variables:
- `AUTH_JWT_VERIFICATION_MODE`
- `AUTH_JWKS_CACHE_TTL_SEC`

Verification evidence:
1. Local mode (`insecure`) accepts valid issuer/audience token (`202` on protected submit).
2. Invalid issuer token rejected with `401` and explicit reason.
3. API runtime and syntax checks pass after auth integration changes.

Impact on previously documented gaps:
1. Gap resolved:
- JWT verification is no longer shape-only; JWKS signature verification path is implemented.
2. Remaining auth follow-up:
- production JWKS observability/alerting and key-rotation playbook validation remain hardening tasks.

## Follow-up 4 Completion - Real S3 Operations and Signed URLs (2026-02-18)

Objective:
- Replace non-local S3 scaffold behavior with real object operations and real cryptographic signed URL generation.

Implementation summary:
1. Replaced scaffold methods in `packages/storage-adapter/src/s3-adapter.js` with real operations:
- `putObject` via `aws s3api put-object`
- `getObject` via `aws s3api get-object`
- `deleteObject` via `aws s3api delete-object`
2. Implemented signed URL generation:
- `getSignedUploadUrl` via `aws s3 presign ... --http-method PUT`
- `getSignedReadUrl` via `aws s3 presign ... --http-method GET`
3. Added S3 healthcheck validation:
- `aws s3api head-bucket`
4. Added stable storage error mapping for AWS command failures (`S3_OPERATION_FAILED`).

Verification evidence:
1. Adapter module syntax and runtime checks pass in local environment.
2. Local pre-prod storage smoke path remains green (`npm run storage:smoke`) for `local_disk` mode.
3. Non-local S3 command execution path implemented and ready, pending environment credentials and bucket access.

Impact on previously documented gaps:
1. Gap resolved:
- S3 operations and presigned URL signing are no longer scaffold-only for non-local mode.
2. Remaining S3 hardening:
- validate IAM/credential and bucket policies in UAT/prod with live resources.

## Historical Task - IaC Provisioning for AWS Storage and Queue Foundations

Status:
- Completed on 2026-02-18. See completion details under `IaC Provisioning Completion - AWS Storage and Queue Foundations (2026-02-18)`.
- Next active implementation scope is Epic B (MVP-1 Core Recommendation Flow).

Objective:
- Introduce Infrastructure as Code (IaC) to provision and manage required AWS resources for non-local environments, avoiding manual console setup except bootstrap credentials/authorization.
- For now, non-local environments are limited to `uat` and `prod` (two only).

Preferred approach:
1. Terraform-first implementation.
2. One root stack with environment-specific variable files (`uat`, `prod`).
3. Remote state optional for first pass; local state acceptable initially if documented.

Prerequisites (manual, one-time):
1. Provisioning identity available (IAM user/role) with rights to manage:
- S3 buckets and bucket policies
- SQS queues and queue policies
- IAM policies and role attachments (if module manages runtime roles)
2. AWS CLI profile configured for provisioning account.
3. Region decision confirmed (default currently `us-east-1`).

In-scope resources for IaC:
1. S3 bucket(s):
- `prostyle-strength-finder-uat`
- `prostyle-strength-finder-prod`
2. S3 controls:
- versioning enabled
- default encryption enabled
- public access block enabled
- bucket policy with least privilege
- lifecycle rules (starter defaults for transient artifacts)
3. SQS queues:
- primary analysis queue per environment
- dead-letter queue per environment
- redrive policy from primary -> DLQ
4. Optional IAM outputs:
- policy documents for app runtime permissions
- role/policy attachment stubs if role ownership is in this repo

Out of scope for this task:
1. Lightsail compute provisioning.
2. Cognito provisioning.
3. DNS/certificate management.
4. Full production observability/alarming setup.

Deliverables:
1. IaC directory structure (example):
- `infra/terraform/modules/s3_bucket`
- `infra/terraform/modules/sqs_queue`
- `infra/terraform/envs/uat`
- `infra/terraform/envs/prod`
2. Reusable Terraform modules:
- S3 module (versioning, encryption, lifecycle, policy hooks)
- SQS module (queue + DLQ + redrive)
3. Environment variable files and outputs:
- bucket names
- queue URLs
- DLQ URLs
- region
4. Execution docs:
- bootstrap instructions
- `terraform init/plan/apply/destroy` commands
- rollback guidance
5. Integration mapping doc updates:
- map Terraform outputs to `.env.uat.example`/`.env.prod.example` values

Implementation plan (next session execution order):
1. Create Terraform scaffolding and backend/provider config.
2. Implement S3 module with required security defaults.
3. Implement SQS module with DLQ/redrive defaults.
4. Instantiate modules for `uat` and `prod`.
5. Add outputs and env-mapping notes.
6. Run `terraform validate` + `terraform plan` for each environment.
7. Record expected apply sequence and safety checks.

Acceptance criteria:
1. All required non-local S3 and SQS resources can be provisioned via IaC only.
2. No mandatory console configuration remains except initial credential/authorization setup.
3. Terraform plan is clean/reproducible for both `uat` and `prod`.
4. Generated outputs map directly to application env contract keys:
- `S3_BUCKET`
- `SQS_QUEUE_URL`
- `SQS_DLQ_URL`
- `AWS_REGION`
5. Documentation is sufficient for a new engineer to run provisioning without tribal knowledge.

Risks and controls:
1. Risk: accidental production drift or destructive apply.
Control: separate `uat`/`prod` env folders, explicit workspace/account checks, and documented plan review gate.
2. Risk: over-permissive IAM policies.
Control: start with least-privilege statements aligned to adapter operations only.
3. Risk: naming collisions across accounts/regions.
Control: include account/environment suffix strategy in module inputs.

## IaC Provisioning Completion - AWS Storage and Queue Foundations (2026-02-18)

Objective:
- Provision and validate non-local AWS storage/queue foundations via Terraform for `uat` and `prod`.

Implementation summary:
1. Added Terraform root under `infra/terraform` with reusable modules:
- `infra/terraform/modules/s3_bucket`
- `infra/terraform/modules/sqs_queue`
2. Added environment stacks:
- `infra/terraform/envs/uat`
- `infra/terraform/envs/prod`
3. Added Terraform execution and output mapping docs:
- `infra/terraform/README.md`
- `infra/terraform/ENV_OUTPUT_MAPPING.md`
4. Added provider lock files per environment:
- `infra/terraform/envs/uat/.terraform.lock.hcl`
- `infra/terraform/envs/prod/.terraform.lock.hcl`
5. Applied Terraform in both environments:
- `uat`: `7 added, 0 changed, 0 destroyed`
- `prod`: `7 added, 0 changed, 0 destroyed`
6. Updated env templates to match provisioned resources:
- `.env.uat.example` queue/DLQ URLs
- `.env.prod.example` queue/DLQ URLs

Verification evidence:
1. Terraform `init`, `validate`, and `plan` completed for both `uat` and `prod`.
2. Live UAT smoke verification passed:
- S3 `put/head/get/delete`
- SQS `send/receive/delete`
3. Live prod smoke verification passed:
- S3 `put/head/get/delete`
- SQS `send/receive/delete`

Provisioned output values:
1. UAT:
- `AWS_REGION=us-east-1`
- `S3_BUCKET=prostyle-strength-finder-uat`
- `SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/512927474334/prostyle-analysis-uat`
- `SQS_DLQ_URL=https://sqs.us-east-1.amazonaws.com/512927474334/prostyle-analysis-uat-dlq`
2. Prod:
- `AWS_REGION=us-east-1`
- `S3_BUCKET=prostyle-strength-finder-prod`
- `SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/512927474334/prostyle-analysis-prod`
- `SQS_DLQ_URL=https://sqs.us-east-1.amazonaws.com/512927474334/prostyle-analysis-prod-dlq`

Acceptance criteria mapping:
1. IaC provisions required non-local S3/SQS resources: complete.
2. No mandatory console steps beyond credential bootstrap: complete.
3. Plan reproducibility for `uat` and `prod`: complete.
4. Output-to-env mapping keys (`S3_BUCKET`, `SQS_QUEUE_URL`, `SQS_DLQ_URL`, `AWS_REGION`): complete.
5. Documentation sufficiency for handoff: complete.

Impact on previously documented gaps:
1. Gap resolved:
- UAT/prod IAM + bucket/queue access validation for configured runtime operations is confirmed by live smoke tests.
2. Remaining infra hardening:
- least-privilege runtime IAM policy tightening and production observability/alerting remain launch-readiness scope (Epic E).

## Follow-up 1 Completion - Durable Job/Run Persistence (2026-02-18)

Objective:
- Replace API/worker in-memory job/run state with SQLite-backed persistence.

Implementation summary:
1. Added DB repository helper:
- `scripts/db/repository.js`
2. API job submission/status now use SQLite:
- idempotency lookup by `idempotency_key`
- insert into `analysis_jobs`
- status reads from `analysis_jobs`
3. Worker lifecycle now persists to SQLite:
- ensures/reads jobs through DB
- attempt count derived from `analysis_runs`
- writes run lifecycle records to `analysis_runs`
- updates `analysis_jobs.status` on transitions
4. Duplicate idempotency handling moved from process memory to DB-backed checks.

Verification evidence:
1. Database reset and migration applied from zero state.
2. API submit returned queued job (`202`).
3. Worker processed submitted job and logged lifecycle transitions.
4. API status lookup after worker run returned persisted `succeeded` state from SQLite.

Impact on previously documented gaps:
1. Gap resolved:
- API/worker now use durable SQLite state for jobs/runs.
2. Remaining follow-ups unchanged:
- production SQS hardening
- production JWKS observability and key-rotation playbook validation
- runtime IAM least-privilege policy refinement and audit for non-local environments

## Follow-up 5 Completion - Prompt Model Version Resolution and Persistence (2026-02-18)

Objective:
- Persist explicit MidJourney model family/version per job/run and resolve defaults when prompt omits model flags.

Implementation summary:
1. Added prompt model resolver module:
- `scripts/models/model-versioning.js`
2. Added runtime default model setter/getter:
- `setCurrentDefaultModels(...)`
- `getCurrentDefaultModels()`
3. Added prompt parsing and resolution rules:
- `--niji <n>` => `niji` + `<n>`
- `--v <n>` (without `--niji`) => `standard` + `<n>`
- no `--v`/`--niji` => default `standard` model version
- reject `--niji` without version
- reject prompts containing both `--v` and `--niji`
4. Added config keys to API/worker:
- `DEFAULT_STANDARD_MODEL_VERSION`
- `DEFAULT_NIJI_MODEL_VERSION`
5. Extended job envelope + validation with:
- `modelFamily`
- `modelVersion`
- `modelSelectionSource`
6. Extended persistence:
- `analysis_jobs`: `model_family`, `model_version`, `model_selection_source`
- `analysis_runs`: `model_family`, `model_version`
7. Added migration:
- `scripts/db/migrations/20260219100000_model_version_defaults.sql`

Verification evidence:
1. Shared contracts build check passed (`npm run contracts`).
2. New migration applied successfully in local (`npm run db:migrate`).
3. API/worker/model-versioning modules pass syntax checks.

Notes:
1. Current defaults are configured as:
- standard: `7`
- niji: `7`
2. Historical rows are backfilled as `standard` `v7` with source `legacy_default_standard_v7`.
