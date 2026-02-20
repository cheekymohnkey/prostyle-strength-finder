# Epic E Backup + Restore Runbook

Status: Draft (E3 in progress)  
Date: 2026-02-20

## Purpose

Provide executable backup/restore drill steps for SQLite with timestamped backup artifacts and post-restore validation.

## Prerequisites

1. Environment loaded:
- `set -a; source .env.local.example; set +a`
2. Database exists and is migrated:
- `npm run db:reset`
3. Tools installed:
- `sqlite3`
- `aws` CLI (for `BACKUP_DESTINATION_MODE=s3`)

## Backup Commands

Local backup destination (drill-friendly):

```bash
BACKUP_DESTINATION_MODE=local BACKUP_LOCAL_DIR=./data/db-backups npm run backup:create
```

S3 backup destination:

```bash
BACKUP_DESTINATION_MODE=s3 BACKUP_S3_PREFIX=db-backups npm run backup:create
```

Notes:
1. Backup creation uses SQLite-safe `VACUUM INTO`.
2. Backup script enforces:
- file exists and non-zero size
- SQLite `PRAGMA integrity_check` returns `ok`
3. S3 mode verifies upload by `head-object` and checks content length.

## Restore Commands

Restore from local file:

```bash
BACKUP_DESTINATION_MODE=local npm run backup:restore -- --from-file <backup_file_path>
```

Restore from S3 key:

```bash
BACKUP_DESTINATION_MODE=s3 npm run backup:restore -- --s3-key <db-backups/YYYY/MM/DD/file.sqlite3>
```

Notes:
1. Restore script keeps a pre-restore snapshot:
- `<target_db_path>.pre-restore-<timestamp>.sqlite3`
2. Restore validates:
- source backup integrity
- target DB integrity after copy
- schema accessibility (`SELECT COUNT(*) FROM schema_migrations`)

## Restore Drill Smoke

Command:

```bash
npm run backup:restore-smoke
```

What it validates:
1. Creates baseline data.
2. Creates backup artifact.
3. Mutates DB after backup.
4. Restores backup.
5. Confirms restored state matches pre-mutation state.

## Suggested Monthly Drill

1. Run backup in S3 mode.
2. Pick latest backup key.
3. Restore into a clean validation DB path.
4. Run:
- `sqlite3 <restored_db> "PRAGMA integrity_check;"`
- `sqlite3 <restored_db> "SELECT COUNT(*) FROM schema_migrations;"`
5. Capture:
- backup key
- restore target path
- integrity output
- operator and timestamp

## Queue Recovery Validation (E3)

Command:

```bash
npm run queue:recovery-smoke
```

What it validates:
1. Forced worker failure drives an analysis job to `dead_letter`.
2. Queue state reflects DLQ pressure (`primary=0`, `deadLetter>=1`).
3. Admin recovery path (`POST /v1/admin/analysis-jobs/:id/moderation` with `action: re-run`) creates a rerun job.
4. Worker processes rerun job to `succeeded`.
5. Validation is performed through API + worker flows without manual DB status edits.
