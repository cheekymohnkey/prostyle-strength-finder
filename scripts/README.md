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

## Recommendation Scripts

- `npm run recommendation:smoke`: Seed minimal style-influence data and verify extraction confirm -> session retrieval returns non-empty persisted recommendations.
