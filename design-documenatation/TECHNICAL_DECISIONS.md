# Prostyle Strength Finder - Technical Decisions

Status: Agreed  
Date: 2026-02-18  
Depends on: `design-documenatation/DECISIONS.md`, `design-documenatation/USER_NEEDS_ANALYSIS.md`, `design-documenatation/ARCHITECTURE_AND_ERD.md`, `design-documenatation/MVP_PATH.md`
Approved on: 2026-02-18

## Purpose

Define technical choices needed to begin implementation with strong architectural guardrails (SOLID/DRY, reliability, recoverability).

## Decision 1: Runtime Architecture

Proposed:
- Modular monolith application + separate async worker process.

Why:
- Simpler to ship than microservices.
- Clear separation of UI/API path and analysis processing.
- Supports growth without premature complexity.

Alternatives considered:
- Single process web app only: rejected (repeats prior failure mode).
- Full microservices: deferred (too much operational overhead for MVP).

## Decision 2: Persistence Layer

Proposed:
- SQLite as MVP system of record.
- Amazon S3 for image and artifact binary storage.
- JSON field for `trait_vector` (with `trait_schema_version`).
- Explicit data-access abstraction (repository/port layer) to enable later migration to server-based Postgres.

Reference:
- S3 bucket/key and IAM conventions are documented in `infra/S3_BUCKET_CONVENTIONS.md`.

Why:
- Near-zero cost and fast local iteration for MVP.
- Relational model still aligns with current ERD and query needs.
- Keeps binary/object storage concerns separate from relational metadata.
- JSON supports trait taxonomy evolution during early iterations.
- Abstraction-first design reduces migration risk later.

Alternatives considered:
- JSON files only: rejected for queryability/reliability.
- DynamoDB: rejected for current relational/query needs.
- Managed RDS now: deferred due current cost constraints.

Migration intent:
1. Keep SQL usage portable (avoid SQLite-only shortcuts where possible).
2. Use migrations from day 1.
3. Keep domain logic DB-agnostic through repository interfaces.
4. Promote to server-based Postgres when concurrency/ops needs outgrow SQLite.
5. Keep object storage access behind a storage adapter (`storage_uri` in DB, blobs in S3).

## Decision 3: Queue and Job Processing

Proposed:
- AWS SQS-backed queue + worker (retry, backoff, dead-letter support).

Why:
- Clean async processing and failure recovery.
- Operationally simple for MVP.
- Cost-aligned with expected low volume (SQS free tier likely sufficient for early stages).

Required behaviors:
1. Idempotent job execution.
2. Retry with capped attempts.
3. Dead-letter state for exhausted jobs.
4. Admin requeue/retry support.

Alternatives considered:
- Redis queue: deferred due extra hosting cost/ops for current stage.

## Decision 4: API Style

Proposed:
- Versioned REST API (`/v1/...`).
- Async endpoints for analysis jobs:
  - submit job
  - query status
  - fetch result
- Hosted on a single Lightsail instance for MVP (API process + worker process).

Why:
- Clear client contract and straightforward implementation.
- Works well with queue-based processing.

## Decision 5: Role Model and Authorization

Proposed:
- AWS Cognito for authentication, with Google as external IdP for sign-in.
- JWT-based API auth using Cognito-issued tokens.
- RBAC with roles in application data model:
  - `admin`
  - `contributor`
  - `consumer`

Why:
- Matches confirmed user types and responsibilities.
- Prevents accidental governance actions by non-admin roles.
- Reduces password-management burden while keeping role control in-app.

Implementation note:
- Authentication (identity) handled by Cognito/Google.
- Authorization (permissions) enforced by application role checks.

## Decision 6: Observability Baseline

Proposed:
- Amazon CloudWatch Logs as log provider.
- Structured logs (JSON format).
- Correlation IDs:
  - request_id
  - job_id
  - analysis_run_id
- Minimal metrics:
  - queue depth
  - success/failure rates
  - retry count
  - time-to-first-recommendation

Why:
- Enables early diagnosis and supports admin debugging requirements.
- Native fit for AWS-hosted MVP with minimal operational overhead.

## Decision 7: Idempotency and Retry Policy

Proposed:
- Job submission requires idempotency key.
- Duplicate keys return existing job status/result.
- Exponential backoff for retries.

Why:
- Prevents duplicate writes and conflicting analysis runs.

## Decision 8: Versioning Strategy

Proposed:
- Store explicit versions on:
  - `analysis_prompt.version`
  - `analysis_run.model_version`
  - `image_trait_analyses.trait_schema_version`
- Track created/updated timestamps on mutable entities.

Why:
- Supports reevaluation when prompts/taxonomy/model behavior change.

## Decision 9: Frontend Strategy

Proposed:
- Keep frontend decoupled from processing (no long-running request ownership).
- UI polls/subscribes for async status updates.

Why:
- Eliminates fragile “web thread owns batch” behavior.

## Decision 10: Deployment Baseline

Proposed:
- One Lightsail instance running:
  - API application process
  - async worker process
  - SQLite database file on persistent local disk
- AWS SQS for queueing.

Why:
- Minimal operational surface while meeting reliability needs.
- Predictable low monthly cost for MVP.

## Decision 11: Caching Tiers and Lookup Reduction

Proposed:
- Tier 0: In-process memory cache (per API/worker process) for hot, low-volatility lookups.
- Tier 1: SQLite as shared durable read source for application data.
- Tier 2: Source systems/external services (SQS/OpenAI/etc.) only when cache/DB data is absent or stale.

Primary cache candidates:
1. `style_influence_types` and other reference/config tables.
2. Active `style_influences` metadata for recommendation assembly.
3. Prompt catalog metadata (`analysis_prompts`, trusted prompt lists).
4. Frequently requested recommendation/session summary views.

TTL defaults (MVP):
1. Reference/config lookups: 10-30 minutes.
2. Prompt and style influence metadata: 5-10 minutes.
3. Session summary projections: 1-5 minutes.

Invalidation rules:
1. Write-through invalidation on admin/contributor updates (disable/pin/unpin/prompt edits).
2. Time-based expiry as fallback.
3. Manual cache flush endpoint for admin/debug usage.

Why:
- Reduces repetitive SQLite reads and external lookups.
- Keeps latency stable for high-frequency read paths.
- Preserves simplicity by avoiding distributed cache infrastructure in MVP.

Deferred:
- Distributed cache tier (Redis/ElastiCache) until multi-node scaling requires shared cache.

## Decision 12: Frontend Stack

Proposed:
- Next.js (App Router) + TypeScript.
- Tailwind CSS + shadcn/ui component system.
- TanStack Query for server-state fetching/caching.
- React Hook Form + Zod for form state and validation.

Why:
- Fast to iterate and maintain for non-frontend-heavy teams.
- Strong ecosystem support for auth, forms, and async UX.
- Good fit for data-driven flows with progressive status updates.

MVP page scope:
1. Recommendation flow page (prompt input, mode, ranked results, rationale/confidence).
2. Post-result feedback page/panel (image upload, emoji sentiment, alignment output).
3. Style influence library page (trait-based browse/filter/compare).
4. Admin operations page (moderation, prompt curation, pin/disable controls).

MVP shared component scope:
1. Recommendation card.
2. Confidence/risk badge block.
3. Prompt improvement panel.
4. Async job status indicator.
5. Filter/sort controls for library and admin tables.

## Decision 13: Environment Strategy (Local Pre-Prod + Two Non-Local Environments)

Proposed:
- Local-first pre-prod testing environment as standard workflow.
- Two non-local environments only for now: `uat` and `prod`.

Local pre-prod baseline:
1. API process + worker process run locally.
2. SQLite local DB file.
3. S3/SQS simulation via LocalStack, or separate low-risk AWS dev resources.
4. Seed fixtures for recommendation, feedback, moderation, and queue-failure scenarios.

UAT baseline:
1. Single Lightsail UAT instance.
2. Isolated S3 bucket and SQS queue (separate from production).
3. Production-like config shape with environment-specific values.

Why:
- Enables fast iteration without cloud-cost friction.
- Catches integration failures before production rollout.
- Maintains high confidence with low operational overhead.

Required rule:
- Environment parity by configuration contract (same env var names and service interfaces across local/uat/prod).

## Decision 14: Testing Strategy

Proposed:
- Backend-first testing investment.
- Minimal but targeted frontend testing.
- Small E2E smoke set for critical flows only.

Test emphasis (target mix):
1. Unit tests (~70%):
- Domain logic:
  - recommendation ranking/mode behavior
  - feedback weighting and confidence adjustments
  - governance and eligibility rules

2. Integration tests (~25%):
- API + persistence adapter behavior.
- Queue processing behavior (submit/retry/dead-letter).
- Storage adapter behavior (S3 URI handling, metadata persistence).

3. E2E/UI smoke tests (~5%):
- Recommendation happy path.
- Post-result feedback path.
- Admin moderation action sanity path.

Frontend test rule:
- Avoid broad brittle UI test suites.
- Test critical forms/validation and key user outcomes only.

Why:
- Maximizes confidence where business risk is highest.
- Avoids disproportionate time sink in fragile front-end test maintenance.
- Keeps release safety through a compact smoke safety net.

## Decision 15: Backend Runtime and Worker Library

Proposed:
- Backend runtime: Node.js + TypeScript.
- API framework: Fastify.
- Worker runtime: dedicated Node.js worker process.
- SQS integration:
  - AWS SDK v3 for queue operations.
  - `sqs-consumer` library for long-poll worker consumption flow.

Why:
- Aligns backend language with frontend TypeScript for shared models/types.
- Fastify provides low-overhead API performance and straightforward structure.
- Dedicated worker process cleanly separates request handling from async analysis execution.
- `sqs-consumer` reduces boilerplate and improves reliability for queue consumption patterns.

Alternatives considered:
- Python backend/worker: viable, but would split language/tooling across stack.
- Raw custom SQS poll loop only: possible, but higher implementation/maintenance overhead for MVP.

## Decision 16: Cognito Auth Integration Details

Proposed:
- Use Cognito Hosted UI with Google IdP.
- Use Authorization Code Flow with PKCE for frontend sign-in.
- Frontend sends Cognito access token as bearer token to API.
- API validates JWT signature and claims against Cognito JWKS.

Token/session handling:
1. Access token: short-lived, used for API authorization.
2. Refresh token: managed by Cognito session flow in frontend auth layer.
3. On token expiry, frontend performs refresh and retries request once.

Role mapping:
1. First successful login creates/links internal user record.
2. Application role (`admin`/`contributor`/`consumer`) is sourced from app DB.
3. API authorization decisions are based on app DB role, not Google claims.

Why:
- Hosted UI + PKCE is secure and low-friction for MVP.
- Keeps identity external and authorization internal.
- Minimizes custom auth surface area.

## Decision 17: Backup and Restore Policy (SQLite + S3)

Proposed:
- S3 is the backup destination for both database backups and image/artifact durability.
- S3 bucket versioning enabled.
- SQLite backup schedule:
  - periodic database backups using SQLite-safe backup methods (`.backup` or `VACUUM INTO`)
  - upload timestamped backups to S3 paths (for example: `db-backups/YYYY/MM/DD/`)
- Restore drills required on a regular schedule (at least monthly in MVP stage).

Retention and protection:
1. S3 lifecycle policy for backup retention tiers (daily/weekly/monthly).
2. Encryption at rest for backups and artifacts (SSE-S3 or SSE-KMS).
3. Backup integrity check (file exists + basic validation) after upload.

Optional enhancement (post-MVP or if tighter recovery needed):
- Litestream replication from SQLite to S3 for lower RPO.

Why:
- Keeps backup architecture simple, low cost, and AWS-native.
- Provides practical recoverability without introducing full RDBMS overhead yet.

## Non-Negotiable Engineering Rules

1. No long-running analysis in request/response cycle.
2. No direct provider SDK calls inside domain logic.
3. All high-impact admin actions must be auditable.
4. Recommendation outputs must include rationale + confidence + risk note.
5. Queue failures must be recoverable without manual DB edits.
6. Cache invalidation must occur on governance/config writes that affect recommendations.

## Remaining Technical Blockers

None.

## Deferred (Non-Blockers for MVP Start)

1. Metric stack expansion beyond CloudWatch baseline (additional APM).
2. LocalStack vs AWS-dev-resource split for local pre-prod testing (can start with one and iterate).
3. Final test tooling selection details (can start backend tests with default stack tooling and tighten later).

## Approval Checklist

Approve this document when:

1. Proposed defaults are accepted or revised.
2. Non-negotiables are accepted as implementation constraints.
3. Remaining technical blockers are resolved.
4. Deferred items are explicitly tracked and accepted.
