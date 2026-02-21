# Prostyle Strength Finder - Environment Configuration Contract

Status: Agreed for Epic A baseline  
Date: 2026-02-18  
Depends on:
- `design-documenatation/TECHNICAL_DECISIONS.md`
- `design-documenatation/IMPLEMENTATION_PLAN.md`
- `design-documenatation/EPIC_A_IMPLEMENTATION_TASKS.md`

## Purpose

Define one configuration contract across `local`, `uat`, and `prod` with consistent key names and adapter expectations.
For the current phase, these are the only supported environments beyond local: `uat` and `prod`.

## Parity Rule

1. The same environment variable keys must exist in every environment.
2. Application components must use the same interface regardless of environment.
3. Only values change by environment.

## Variable Contract

| Variable | Required | Components | Format | Notes |
| --- | --- | --- | --- | --- |
| `NODE_ENV` | Yes | API, Worker | `development|test|production` | Runtime mode for node process behavior. |
| `APP_ENV` | Yes | API, Worker, Frontend | `local|uat|prod` | Deployment environment selector. |
| `PORT` | Yes | API | integer | API bind port in each environment. |
| `DATABASE_URL` | Yes | API, Worker | SQLite DSN/path | MVP uses SQLite path (example: `file:./data/prostyle.db`). |
| `SQS_QUEUE_URL` | Yes | API, Worker | URL | Primary queue URL. |
| `SQS_DLQ_URL` | Yes | API, Worker | URL | Dead-letter queue URL. |
| `SQS_MAX_ATTEMPTS` | Yes | API, Worker | integer | Retry cap before dead-letter. |
| `SQS_RETRY_BASE_MS` | Yes | API, Worker | integer | Base delay for backoff strategy. |
| `QUEUE_ADAPTER_MODE` | No | API, Worker | `sqlite|sqs` | Defaults to `sqlite` in `local`, `sqs` otherwise. |
| `S3_BUCKET` | Yes | API, Worker | string | Bucket for image/artifact object storage. |
| `AWS_REGION` | Yes | API, Worker | AWS region | Example: `us-east-1`. |
| `S3_ENDPOINT_OVERRIDE` | No | API, Worker | URL | Local simulation endpoint (for LocalStack/dev). |
| `COGNITO_USER_POOL_ID` | Yes | API, Worker | string | Cognito user pool identifier. |
| `COGNITO_CLIENT_ID` | Yes | API, Worker | string | Cognito app client identifier. |
| `COGNITO_ISSUER` | Yes | API, Worker | URL | JWT issuer expected by API. |
| `COGNITO_AUDIENCE` | Yes | API, Worker | string | JWT audience expected by API. |
| `FRONTEND_AUTH_MODE` | No | Frontend | `cognito|disabled` | Frontend auth mode. `disabled` is allowed only when `APP_ENV=local`. |
| `COGNITO_HOSTED_UI_BASE_URL` | Yes | Frontend | URL | Cognito Hosted UI domain base URL used for `/oauth2/authorize`, `/oauth2/token`, and `/logout`. |
| `COGNITO_REDIRECT_PATH` | No | Frontend | path | Frontend callback path for OAuth code exchange (default `/api/auth/callback`). |
| `COGNITO_POST_LOGOUT_REDIRECT_PATH` | No | Frontend | path | App path used as Cognito logout return target (default `/`). |
| `FRONTEND_SESSION_SECRET` | Yes | Frontend | string | HMAC signing secret for encrypted/signed frontend auth session cookie. |
| `FRONTEND_SESSION_COOKIE_NAME` | No | Frontend | string | Frontend auth session cookie key (default `prostyle_frontend_session`). |
| `LOCAL_AUTH_BYPASS_SUBJECT` | No | Frontend | string | Local bypass subject when `FRONTEND_AUTH_MODE=disabled` (default `frontend-local-user`). |
| `LOCAL_AUTH_BYPASS_EMAIL` | No | Frontend | string | Optional local bypass email claim when `FRONTEND_AUTH_MODE=disabled`. |
| `AUTH_JWT_VERIFICATION_MODE` | No | API | `jwks|insecure` | `jwks` verifies signature against JWKS; `insecure` validates claims only (local dev only). |
| `AUTH_JWKS_CACHE_TTL_SEC` | No | API | integer | JWKS cache TTL in seconds (default `600`). |
| `DEFAULT_STANDARD_MODEL_VERSION` | Yes | API, Worker | integer string | Current default MidJourney standard model version used when prompt has no `--v`/`--niji`. |
| `DEFAULT_NIJI_MODEL_VERSION` | Yes | API, Worker | integer string | Current default niji model version used for default tables and operations that need niji fallback metadata. |
| `TRAIT_INFERENCE_MODE` | No | API, Worker | `deterministic|llm` | Trait inference execution mode. Defaults to `deterministic` for local safety. |
| `OPENAI_API_KEY` | Conditional | API, Worker | string | Required when `TRAIT_INFERENCE_MODE=llm`. |
| `OPENAI_MODEL` | No | API, Worker | string | OpenAI model id for trait inference (default `gpt-4.1-mini`). |
| `OPENAI_BASE_URL` | No | API, Worker | URL | Base URL for OpenAI-compatible endpoint (default `https://api.openai.com/v1`). |
| `LOG_LEVEL` | Yes | API, Worker | `debug|info|warn|error` | Structured logging level. |
| `SERVICE_NAME` | Yes | API, Worker | string | Service identifier in logs. |
| `LOG_INCLUDE_CORRELATION_IDS` | No | API, Worker | `true|false` | Defaults to `true` when omitted. |
| `NEXT_PUBLIC_API_BASE_URL` | Yes | Frontend | URL | API base URL exposed to browser runtime. |
| `NEXT_PUBLIC_APP_BASE_URL` | Yes | Frontend | URL | Browser-visible frontend base URL used to build OAuth redirect/logout URIs. |

## Ownership and Validation

1. API validates all required API keys at startup and exits on missing/invalid values.
2. Worker validates all required worker keys at startup and exits on missing/invalid values.
3. Frontend validates `NEXT_PUBLIC_API_BASE_URL` and `APP_ENV`.
4. Integer keys must be parseable as base-10 integers.

## Local Pre-Prod Defaults

1. `APP_ENV=local`
2. `NODE_ENV=development`
3. SQLite DB path points to local file under repository tree.
4. Queue and object storage endpoints may point to LocalStack or isolated dev AWS resources.

## Environment Template Files

Use these templates as the baseline:

1. `.env.local.example`
2. `.env.uat.example`
3. `.env.prod.example`

## Current Non-Local Provisioned Values (2026-02-18)

Source:
- Terraform stack outputs from `infra/terraform/envs/uat` and `infra/terraform/envs/prod`.

UAT:
1. `AWS_REGION=us-east-1`
2. `S3_BUCKET=prostyle-strength-finder-uat`
3. `SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/512927474334/prostyle-analysis-uat`
4. `SQS_DLQ_URL=https://sqs.us-east-1.amazonaws.com/512927474334/prostyle-analysis-uat-dlq`

Prod:
1. `AWS_REGION=us-east-1`
2. `S3_BUCKET=prostyle-strength-finder-prod`
3. `SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/512927474334/prostyle-analysis-prod`
4. `SQS_DLQ_URL=https://sqs.us-east-1.amazonaws.com/512927474334/prostyle-analysis-prod-dlq`

## Prompt Model Versioning Rules (2026-02-18)

1. If prompt contains `--niji <version>`:
- model family = `niji`
- model version = explicit `<version>`
- `--niji` without version is rejected.
2. If prompt contains `--v <version>` and no `--niji`:
- model family = `standard`
- model version = explicit `<version>`
- `--v` without version is rejected.
3. If prompt contains neither `--v` nor `--niji`:
- model family = `standard`
- model version = `DEFAULT_STANDARD_MODEL_VERSION`
4. Prompt cannot include both `--v` and `--niji` in the same submission.
