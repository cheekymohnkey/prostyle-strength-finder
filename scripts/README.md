# Scripts

Purpose:
- Automation helpers for local setup, validation, and repeatable project tasks.

Guidelines:
- Keep scripts idempotent and safe for local developer use.

## Database Scripts

- `npm run db:migrate`: Apply pending migrations.
- `npm run db:status`: Show applied/pending migrations.
- `npm run db:create -- <name>`: Create timestamped migration template.
- `npm run db:rollback`: Roll back last migration (requires `-- migrate:down` section).
- `npm run db:reset`: Recreate local database and re-apply migrations.

## Storage Scripts

- `npm run storage:smoke`: Run local put/get/delete smoke validation through the storage adapter.
- `npm run style-dna:taxonomy-seed-rollout-artifacts-upload-ci`: Run CI wrapper for rollout upload smoke (`isolated` default, `--storage-policy-mode shared` for shared storage env contract validation).

## Recommendation Scripts

- `npm run recommendation:smoke`: Seed minimal style-influence data and verify extraction confirm -> session retrieval. Includes checks for threshold policy, deterministic ordering, low-confidence labeling, and confirm idempotency.
## Production Operations Scripts

**Log Inspection:**
- `npm run ops:logs [lines]`: SSH to production and fetch recent service logs (default: 20 lines)
  - Shows API/frontend/worker journals and nginx access/error logs
  - Much faster than GitHub Actions for debugging (~2 seconds vs ~30 seconds)

**Database Inspection:**
- `npm run ops:db:summary`: Show counts of all major entities (users, analyses, baselines, runs)
- `npm run ops:db:baselines`: List baseline render sets with parameter details
- `npm run ops:db:suites`: Show baseline prompt suites with all prompt items
- `npm run ops:db:runs`: Show recent Style-DNA runs and status counts
- `./scripts/ops/inspect-prod-db.sh items <set-id>`: Show items for specific baseline set

**Baseline Management:**
- `npm run ops:seed-baselines`: Seed production with V1 baseline tests
  - Prompts for seed value (default: 777) and quality value (default: 1)
  - Creates 1 baseline prompt suite with 10 prompts
  - Creates 3 baseline render sets (stylize: 0, 100, 1000)
  - Model: Midjourney standard v7
  - Shows verification output with all prompts

**Infrastructure:**
- `npm run ops:update-nginx`: Update nginx configuration on production server
  - Uploads latest nginx config template
  - Substitutes environment variables
  - Tests and reloads nginx
  - Use after modifying `deploy/nginx/prostyle.conf.template`

**Admin Provisioning:**
- `npm run ops:bootstrap-admin`: Bootstrap admin user in production database
  - Prompts for Cognito user pool ID and user sub
  - Creates or updates user with admin role

**Operational Health:**
- `npm run ops:checks`: Run production operational checks
  - Queue lag monitoring
  - Dead-letter queue monitoring
  - Error rate visibility (when available)

**Notes:**
- All ops scripts use hardcoded SSH connection details for `ubuntu@98.87.97.135`
- Requires SSH key at `~/.ssh/prostyle-prod.pem` with correct permissions (`chmod 400`)
- Read-only inspection scripts are safe to run anytime
- Mutation scripts (seed, bootstrap-admin) prompt for confirmation