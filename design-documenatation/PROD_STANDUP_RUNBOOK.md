# Prostyle Strength Finder - Production Stand-Up Runbook

Status: Active  
Date: 2026-02-20

## Purpose

Stand up production using the current strategy: `local` + `prod` (UAT deferred).

## Scope

1. Provision and verify prod AWS dependencies.
2. Provision prod compute and deploy API/worker/frontend.
3. Run production-safe verification checks.

## Critical Safety Rules

1. Never run `npm run db:reset` in production.
2. Never run smoke scripts that mutate/reset prod data unless explicitly reviewed.
3. Always back up SQLite before schema changes or deploys.

## Phase 0 - Preconditions

1. AWS account access with S3/SQS/Lightsail permissions.
2. Production DNS domain and TLS plan.
3. Cognito production pool/client values.
4. OpenAI API key (if `TRAIT_INFERENCE_MODE=llm` in prod).

## Phase 1 - Verify Prod AWS Foundation

From repo root:

```bash
cd infra/terraform/envs/prod
terraform init
terraform validate
terraform plan
terraform output
```

Validate outputs are present:
1. `s3_bucket`
2. `sqs_queue_url`
3. `sqs_dlq_url`
4. `aws_region`

## Phase 2 - Provision Prod Compute

Current repo does not provision Lightsail compute via Terraform.
Provision manually (or via separate IaC later):

1. Create Lightsail instance (Ubuntu or Amazon Linux).
2. Attach static IP.
3. Open required ports (`22`, `80`, `443`; app port internal only if proxied).
4. Configure DNS (`api.<your-domain>` -> static IP).

Recommended starting profile:
1. Platform: Linux/Unix
2. Blueprint: Ubuntu LTS (latest supported)
3. Plan: start with a small-general purpose instance, then scale vertically after traffic data
4. Region: `us-east-1` (to match S3/SQS region in current config)
5. Storage: add enough disk for SQLite growth + backup staging (do not use minimal defaults for long-term prod)

Firewall baseline:
1. Allow `22` only from trusted admin IPs.
2. Allow `80` from `0.0.0.0/0` (for HTTP->HTTPS redirect).
3. Allow `443` from `0.0.0.0/0`.
4. Do not expose app process ports directly (`3000/3001`) publicly.

DNS baseline:
1. `api.<your-domain>` `A` record -> Lightsail static IP.
2. Optional: `app.<your-domain>` `A` record -> same static IP (if frontend served on same host).

Provisioning verification:
```bash
# Local machine
dig +short api.<your-domain>

# From admin machine
ssh <user>@<lightsail-static-ip>
```

## Instance Sizing Decision Gate

Make the first sizing call during Phase 2, then revisit after production telemetry.

Initial recommendation:
1. Start with a small general-purpose Lightsail instance for first launch.
2. Prefer vertical scaling over premature multi-host setup for this MVP architecture.

First review window:
1. 24-72 hours after launch.
2. Again at 1-2 weeks.

Scale-up triggers (any sustained condition):
1. CPU consistently >70% during normal traffic periods.
2. Memory pressure causing swap activity or process restarts.
3. Queue lag repeatedly breaching operational threshold.
4. API p95 latency repeatedly missing expected budget.

Decision output (record each review):
1. Keep current size.
2. Increase Lightsail plan tier.
3. Identify app bottleneck first (for example query/index or worker concurrency) before scaling.

## Phase 3 - Bootstrap Instance

On instance:

```bash
cd /opt/prostyle/app
./scripts/prod/bootstrap-instance.sh
```

Install runtime:
1. Node.js 20
2. npm
3. sqlite3 CLI
4. awscli

## Phase 4 - Deploy Application

On instance:

```bash
cd /opt/prostyle
git clone <repo-url> app
cd app
npm ci
npm run contracts
```

Create production env file (example path):
1. `/opt/prostyle/app/.env.prod`
2. Start from `.env.prod.example` and fill secrets/real endpoints.
3. Validate against `design-documenatation/PROD_ENV_CHECKLIST.md` before starting services.
4. Optional sanitized starter template: `.env.prod.template.final`.

Required checks before start:
1. `APP_ENV=prod`
2. `NODE_ENV=production`
3. `QUEUE_ADAPTER_MODE=sqs`
4. `AUTH_JWT_VERIFICATION_MODE=jwks`
5. `DATABASE_URL=file:/var/lib/prostyle/prostyle.prod.db`
6. `S3_BUCKET`, `SQS_QUEUE_URL`, `SQS_DLQ_URL`, `AWS_REGION` match Terraform outputs
7. `COGNITO_*` values are production values
8. `NEXT_PUBLIC_API_BASE_URL` matches production API URL

## Phase 5 - Database Migration and Backup

Before first migrate/update:

```bash
cd /opt/prostyle/app
set -a; source .env.prod; set +a
npm run backup:create
npm run db:migrate
npm run db:status
```

Expected:
1. Backup command succeeds.
2. Migrations apply cleanly.
3. `db:status` shows no pending migrations.

## Phase 6 - Process Management

Run as managed services (systemd recommended):
1. API service: `npm run api`
2. Worker service: `npm run worker`
3. Frontend service: `npm run frontend` (or serve behind reverse proxy strategy)

Install managed services from templates:

```bash
cd /opt/prostyle/app
APP_DIR=/opt/prostyle/app ENV_FILE=/opt/prostyle/app/.env.prod RUN_USER=$USER ./scripts/prod/install-systemd.sh
sudo systemctl restart prostyle-api prostyle-worker prostyle-frontend
sudo systemctl status prostyle-api prostyle-worker prostyle-frontend --no-pager
```

Minimum requirement:
1. Services auto-restart on failure.
2. Services start on boot.
3. Logs are persisted and rotated.

## Phase 7 - Reverse Proxy and TLS

1. Configure Nginx/Caddy in front of API/frontend.
2. Enable HTTPS certificates.
3. Route:
- public API URL -> API service
- public app URL -> frontend service

Nginx template install helper:

```bash
cd /opt/prostyle/app
API_HOST=api.<your-domain> APP_HOST=app.<your-domain> ./scripts/prod/install-nginx.sh
```

TLS note:
1. The nginx template expects cert files under `/etc/letsencrypt/live/<host>/...`.
2. Provision certificates before enabling production traffic.

## Phase 8 - Production-Safe Verification

Run only non-destructive checks:

```bash
cd /opt/prostyle/app
set -a; source .env.prod; set +a
npm run ops:checks
```

And endpoint checks:
1. `GET /v1/health` returns `200`.
2. API auth enforcement behaves as expected (`401/403` for unauthorized paths).
3. Frontend can reach API via configured base URL.

## Phase 9 - Go-Live Checklist

1. Backup job schedule is configured.
2. Queue lag/dead-letter thresholds are reviewed.
3. On-call/rollback owner is assigned.
4. Release tag/commit hash is recorded.
5. Launch sign-off captured.

## Rollback (Minimum)

1. Stop services.
2. Restore latest known-good backup.
3. Re-deploy previous known-good release.
4. Start services and verify `/v1/health` + `npm run ops:checks`.
