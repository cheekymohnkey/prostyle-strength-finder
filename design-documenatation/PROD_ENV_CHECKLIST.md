# Prostyle Strength Finder - Production Env Checklist

Status: Active  
Date: 2026-02-20

## Purpose

Provide a production-safe `.env.prod` checklist and pre-start validation steps.

Source-of-truth rule:
1. GitHub secret `PROD_ENV_FILE` is written to `/opt/prostyle/app/.env.prod` during deploy.
2. Deploy workflow validates required keys but does not rewrite application config values.

## Base Template

1. For current Lightsail production, start from `.env.prod.template.final`.
2. For future IAM-enabled environments, `.env.prod.example` remains the S3/SQS-target baseline.
3. Save as `/opt/prostyle/app/.env.prod` on the production host.

## Required Production Values

Core runtime:
1. `NODE_ENV=production`
2. `APP_ENV=prod`
3. `PORT=3000`

Database:
1. `DATABASE_URL=file:/opt/prostyle/app/data/prostyle.db`

Queue:
1. `QUEUE_ADAPTER_MODE=sqlite` (required for Lightsail; no IAM instance profile available)
2. `SQS_QUEUE_URL` must match Terraform prod output (required even with sqlite adapter for config validation).
3. `SQS_DLQ_URL` must match Terraform prod output (required even with sqlite adapter for config validation).
4. `SQS_MAX_ATTEMPTS` is integer (default `5`).
5. `SQS_RETRY_BASE_MS` is integer (default `2000`).

Storage:
1. `STORAGE_ADAPTER_MODE=local` (required for Lightsail; no IAM instance profile available)
2. `S3_BUCKET` must match Terraform prod output (required even with local adapter for config validation).
3. `AWS_REGION` must match Terraform prod output (`us-east-1` currently).
4. `S3_ENDPOINT_OVERRIDE` must be empty in production.
5. Local storage will use filesystem under `data/storage/` directory.

Auth:
1. `COGNITO_USER_POOL_ID` must be production pool id.
2. `COGNITO_CLIENT_ID` must be production client id.
3. `COGNITO_ISSUER` must match production pool issuer URL.
4. `COGNITO_AUDIENCE` must match production audience/client id.
5. `AUTH_JWT_VERIFICATION_MODE=jwks`
6. `AUTH_JWKS_CACHE_TTL_SEC` is integer (default `600`).

Model defaults:
1. `DEFAULT_STANDARD_MODEL_VERSION` set.
2. `DEFAULT_NIJI_MODEL_VERSION` set.

LLM mode:
1. If `TRAIT_INFERENCE_MODE=llm`, set valid `OPENAI_API_KEY`.
2. `OPENAI_MODEL` and `OPENAI_BASE_URL` must be intentional and valid.

Observability:
1. `LOG_LEVEL=info` (or stricter).
2. `SERVICE_NAME=prostyle-api`
3. `LOG_INCLUDE_CORRELATION_IDS=true`

Frontend:
1. `NEXT_PUBLIC_API_BASE_URL` must point at production API URL (for example `https://api.<your-domain>/v1`).

## Terraform Output Cross-Check

From repo root:

```bash
cd infra/terraform/envs/prod
terraform output
```

Match these values into `.env.prod`:
1. `s3_bucket` -> `S3_BUCKET`
2. `sqs_queue_url` -> `SQS_QUEUE_URL`
3. `sqs_dlq_url` -> `SQS_DLQ_URL`
4. `aws_region` -> `AWS_REGION`

## Pre-Start Validation Commands (On Prod Host)

Syntax + required key checks:

```bash
cd /opt/prostyle/app
set -a; source .env.prod; set +a
node -e "require('./apps/api/src/config').loadConfig(); console.log('api config ok')"
node -e "require('./apps/worker/src/config').loadConfig(); console.log('worker config ok')"
node -e "require('./apps/frontend/src/config').loadFrontendConfig(); console.log('frontend config ok')"
```

Operational minimum checks:

```bash
cd /opt/prostyle/app
set -a; source .env.prod; set +a
npm run contracts
npm run db:migrate
npm run db:status
```

## Security Handling Notes

1. Never commit `.env.prod`.
2. Restrict file permissions on `.env.prod`:

```bash
chmod 600 /opt/prostyle/app/.env.prod
```

3. Rotate production secrets if exposed.
