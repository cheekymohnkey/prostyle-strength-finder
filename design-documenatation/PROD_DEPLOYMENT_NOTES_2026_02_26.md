# Production Deployment Notes - 2026-02-26

Status: Active  
Date: 2026-02-26  
Context: Initial production deployment and debugging session

## Summary

First production deployment to AWS Lightsail. Encountered several configuration issues specific to Lightsail's lack of IAM instance profile, which were resolved by switching to local/SQLite adapters and updating nginx configuration.

## Issues Encountered and Resolved

### 1. API Crash Loop - Storage Adapter Failure

**Symptom:** API service crash-looping with `api.storage.init_failed: "aws s3api failed"`

**Root Cause:** `S3StorageAdapter.healthcheck()` attempted to run `aws s3api head-bucket` which failed on Lightsail because there are no IAM instance credentials available.

**Resolution:**
- Added `STORAGE_ADAPTER_MODE=local` to use `LocalDiskStorageAdapter` 
- Made storage healthcheck non-fatal (logs warning, server continues)
- (Historical) Updated systemd service templates with `Environment=STORAGE_ADAPTER_MODE=local`
- Storage now uses local filesystem under `data/storage/` directory
- Current worker startup behavior is now configurable with `WORKER_STRICT_HEALTHCHECK`:
  - `false` (default): queue/storage healthcheck failures log warnings and worker continues startup
  - `true`: worker fails fast on queue/storage healthcheck errors

**Commit:** `bdf816c`

### 2. Queue Adapter - SQS CLI Failure

**Symptom:** Style-DNA run submission failed with `QUEUE_UNAVAILABLE: aws CLI spawn error: spawnSync aws ENOENT`

**Root Cause:** `.env.prod` had `QUEUE_ADAPTER_MODE=sqs` but Lightsail has no IAM credentials for AWS CLI.

**Resolution:**
- Updated `.env.prod` on server to `QUEUE_ADAPTER_MODE=sqlite`
- (Historical) Systemd service template already had override: `Environment=QUEUE_ADAPTER_MODE=sqlite`
- Queue now uses SQLite tables for message queuing
- Updated documentation to clarify Lightsail requires SQLite adapter

**Note:** Should update GitHub secrets `PROD_ENV_FILE` to have `QUEUE_ADAPTER_MODE=sqlite` for consistency.

### 3. Admin API Routes Returning 404

**Symptom:** All Style-DNA admin endpoints returning 404 errors

**Root Cause:** Deploy workflow set `NEXT_PUBLIC_API_BASE_URL=https://api.cheekymohnkey.com` (missing `/v1` prefix). API routes registered at `/v1/admin/*` but frontend proxy forwarding to `/admin/*`.

**Resolution:**
- Updated deployment workflow to include `/v1` suffix at build time (line 60) and runtime (line 229)
- Changed to: `NEXT_PUBLIC_API_BASE_URL=https://api.cheekymohnkey.com/v1`

**Commit:** `a575380`

### 4. Baseline Upload - 413 Payload Too Large

**Symptom:** Baseline grid image uploads failing with `Request failed (413) [REQUEST_FAILED]`

**Root Cause:** Nginx default `client_max_body_size` is 1MB. Baseline grid images (4x 2-3MB images + base64 encoding) easily exceed this limit.

**Resolution:**
- Added `client_max_body_size 50M;` to both API and frontend nginx server blocks
- Created `scripts/ops/update-nginx-config.sh` for deploying nginx configuration changes
- Added npm script: `npm run ops:update-nginx`

**Commits:** `d9b4069`, `1a28674`

### 5. Baseline Parameters Not in Generated Prompts

**Symptom:** Generated prompts always had `--q 1` even when baseline set was created with quality=4

**Root Cause:** Prompt generation endpoint (`POST /v1/admin/style-dna/prompt-jobs`) was not reading the baseline set's `parameter_envelope_json`. It only used style adjustment and stylize tier.

**Resolution:**
- Updated prompt generation to parse baseline set's parameter envelope
- Now includes `--ar`, `--seed`, `--raw`, and `--q` parameters from baseline in generated prompts
- Ensures generated prompts match exact parameters used to create baseline renders

**Commit:** `e630792`

### 6. SQL Query Ambiguous Column Error

**Symptom:** Baseline seed verification query failing with "ambiguous column name: prompt_key"

**Root Cause:** `prompt_key` column exists in both `baseline_prompt_suite_items` and `baseline_prompt_suite_item_metadata` tables.

**Resolution:**
- Added table alias: Changed `prompt_key` to `bpsi.prompt_key` in SELECT

**Commit:** `45d0838`

## New Operational Tooling

Created several production operations scripts for rapid debugging and management:

### Log Inspection
- **Script:** `scripts/ops/check-prod-logs.sh`
- **Usage:** `npm run ops:logs [lines]`
- **Purpose:** SSH to production and fetch service journals + nginx logs
- **Performance:** ~2 seconds vs GitHub Actions ~30 seconds
- **Commit:** `098655f`

### Database Inspection
- **Script:** `scripts/ops/inspect-prod-db.sh`
- **Usage:** 
  - `npm run ops:db:summary` - Entity counts
  - `npm run ops:db:baselines` - Baseline render sets
  - `npm run ops:db:suites` - Prompt suites with items
  - `npm run ops:db:runs` - Style-DNA runs
- **Purpose:** Read-only database queries without manual SSH/SQL
- **Commits:** `2177a88`, `7d1e761`

### Baseline Seeding
- **Script:** `scripts/ops/seed-prod-baselines.sh`
- **Usage:** `npm run ops:seed-baselines`
- **Purpose:** Seed production with V1 baseline tests
- **Features:**
  - Prompts for seed value (default: 777)
  - Prompts for quality value (default: 1)
  - Creates 1 suite with 10 prompts + 3 baseline sets (s=0, 100, 1000)
  - Shows verification with all prompts
- **Commits:** `30eb4ab`, `ffe4d15`, `17f2707`

### Nginx Configuration Deployment
- **Script:** `scripts/ops/update-nginx-config.sh`
- **Usage:** `npm run ops:update-nginx`
- **Purpose:** Deploy nginx configuration changes to production
- **Features:**
  - Uploads template, substitutes env vars
  - Tests configuration before reload
  - Reloads nginx if test passes
- **Commit:** `d9b4069`

## Configuration Changes

### Required Environment Variables (Lightsail)

```bash
# Adapter overrides required for Lightsail (no IAM credentials)
QUEUE_ADAPTER_MODE=sqlite
STORAGE_ADAPTER_MODE=local

# API base URL must include /v1 prefix
NEXT_PUBLIC_API_BASE_URL=https://api.cheekymohnkey.com/v1
```

### Systemd Service Template Updates

Current approach:

```ini
# Adapter/runtime values are sourced from .env.prod (written from PROD_ENV_FILE during deploy)
# systemd unit files should avoid overriding app configuration values.
```

### Nginx Configuration Additions

`deploy/nginx/prostyle.conf.template` now includes:

```nginx
# Allow large uploads for baseline grid images (4x images + base64 encoding overhead)
client_max_body_size 50M;
```

## Code Improvements

### Baseline Seeding Configurability

- **Before:** Hardcoded `seed: 42`, `quality: 1`
- **After:** Reads `BASELINE_SEED` and `BASELINE_QUALITY` env vars with defaults 777 and 1
- **Benefit:** Can create multiple baseline sets with different parameters for testing

### Prompt Generation Completeness

- **Before:** Only included style adjustment and stylize tier
- **After:** Includes all baseline envelope parameters (aspect ratio, seed, raw, quality)
- **Example:** `a person --ar 1:1 --seed 777 --raw --sref sref-123 --sw 100 --stylize 0 --v 7 --q 4`
- **Benefit:** Generated prompts exactly match baseline render parameters

## Production State

**Current Configuration:**
- Instance: AWS Lightsail Ubuntu 22.04
- IP: 98.87.97.135
- Domains: api.cheekymohnkey.com, app.cheekymohnkey.com
- Queue: SQLite (local database)
- Storage: Local disk (data/storage/)
- Database: SQLite (data/prostyle.db)
- Admin User: Cognito sub `64983488-8091-70a5-7d60-b71c27a26cb4`

**Verified Working:**
- API health endpoint
- Cognito authentication flow
- Admin authorization
- Baseline set creation with quality parameter
- Baseline grid image upload (up to 50MB)
- Prompt generation with full parameter envelope
- Style-DNA run submission
- Job queueing via SQLite adapter

**Known Limitations:**
- Lightsail has no IAM instance profile (cannot use AWS SQS/S3 directly)
- Must use SQLite queue adapter and local storage adapter
- Worker process not yet fully tested in production
- Frontend UX may need refinement (not fully tested beyond Style-DNA admin screen)

## Lessons Learned

1. **Lightsail IAM Constraints:** Always verify IAM availability before choosing cloud compute platform. Lightsail cannot assume roles like EC2.

2. **Adapter Pattern Value:** Having queue and storage adapters with local/SQLite fallbacks was critical for rapid deployment pivot.

3. **Non-Fatal Healthchecks:** Making storage/queue healthchecks non-fatal (log warnings but don't crash) prevented unnecessary service failures.

4. **Ops Tooling Priority:** Creating rapid SSH-based inspection scripts early saved significant time during debugging (2s vs 30s per check).

5. **API Base URL Specificity:** Always include version prefix (`/v1`) in API base URL configuration to avoid routing mismatches.

6. **Nginx Defaults:** Default 1MB body size is insufficient for modern image uploads. Always configure explicitly based on use case.

7. **Configuration Documentation:** Comprehensive documentation of adapter modes and Lightsail-specific requirements prevents future confusion.

## Next Steps

1. **GitHub Secrets Update:** Update `PROD_ENV_FILE` secret to have `QUEUE_ADAPTER_MODE=sqlite` for deployment consistency

2. **Worker Testing:** Verify worker process can successfully poll and process Style-DNA analysis jobs

3. **Frontend Polish:** Review remaining admin screens and UX flows beyond Style-DNA

4. **Monitoring Setup:** Consider CloudWatch agent or similar for centralized logging if Lightsail limitations allow

5. **Backup Schedule:** Configure regular backup jobs for SQLite database

6. **Documentation Review:** Update any remaining documentation that assumes SQS/S3 availability

## Related Documentation

- [PROD_STANDUP_RUNBOOK.md](PROD_STANDUP_RUNBOOK.md) - Updated with Lightsail adapter requirements
- [PROD_ENV_CHECKLIST.md](PROD_ENV_CHECKLIST.md) - Updated with required adapter modes
- [ENVIRONMENT_CONFIGURATION_CONTRACT.md](ENVIRONMENT_CONFIGURATION_CONTRACT.md) - Updated with adapter mode details
- [scripts/README.md](../scripts/README.md) - Added ops scripts documentation

## Deployment Timeline

- **Feb 25, 2026:** Initial deployment via GitHub Actions
- **Feb 26, 2026 (morning):** Storage adapter crash loop discovered and fixed
- **Feb 26, 2026 (afternoon):** API route 404s fixed, nginx limits increased
- **Feb 26, 2026 (evening):** Queue adapter issue resolved, prompt generation fixed
- **Feb 26, 2026 (night):** Production operational tooling completed, baseline tests seeded

## Contact

For questions about this deployment or issues with the production environment, refer to:
- This document for historical context
- `PROD_STANDUP_RUNBOOK.md` for procedures
- `scripts/README.md` for operational tooling
