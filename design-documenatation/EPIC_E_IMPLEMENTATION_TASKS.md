# Prostyle Strength Finder - Epic E Implementation Tasks

Status: Completed (E1-E4 completed)  
Date: 2026-02-20  
Depends on:
- `design-documenatation/DECISIONS.md`
- `design-documenatation/ARCHITECTURE_AND_ERD.md`
- `design-documenatation/TECHNICAL_DECISIONS.md`
- `design-documenatation/MVP_PATH.md`
- `design-documenatation/IMPLEMENTATION_PLAN.md`
- `design-documenatation/EPIC_D_IMPLEMENTATION_TASKS.md`
- `design-documenatation/EPIC_D_D8_HANDOVER.md`

## Purpose

Translate Epic E (Hardening, Observability, and Launch Readiness) into executable engineering tasks with clear acceptance criteria, sequencing, and handoff context.

## Entry Snapshot (2026-02-20)

1. Epics A-D are complete and smoke-verified.
2. E1 is completed:
- admin role-management endpoints and audit coverage are implemented
- `npm run admin:role-management-smoke` is implemented and passing
3. E2 is completed:
- in-process recommendation cache registry is implemented
- invalidation wiring is active on recommendation-affecting write paths
- `npm run cache:invalidation-smoke` is implemented and passing
4. E3 is completed:
- backup/restore scripts and drill runbook are implemented
- `npm run backup:restore-smoke` is implemented and passing
- `npm run queue:recovery-smoke` validates dead-letter + admin re-run recovery without manual DB edits
5. E4 is completed:
- structured log correlation now propagates `request_id` into worker lifecycle logs via job envelope context
- `npm run ops:checks` is implemented for queue lag/dead-letter/error-rate visibility
- `npm run frontend:critical-flow-smoke` is implemented for frontend critical flow availability/proxy checks
- `npm run launch:readiness-smoke` is implemented with pass/fail launch gates
6. Epic E closeout runbooks are published:
- `design-documenatation/EPIC_E_BACKUP_RESTORE_RUNBOOK.md`
- `design-documenatation/EPIC_E_LAUNCH_RUNBOOK.md`
7. Epic E is now the reliability/recoverability/release-safety focus before broader launch.

## Epic E Objective

Ensure system reliability, recoverability, observability, and operational safety for launch readiness.

## Scope

1. Authorization hardening (role-management operations).
2. Real cache invalidation for recommendation-affecting writes.
3. Backup/restore operationalization (SQLite + S3) and drill repeatability.
4. Queue/dead-letter operational monitoring and recovery validation.
5. Test baseline expansion and launch-gate checks.

## Out of Scope

1. Full enterprise multi-tenant policy engine.
2. Large analytics/dashboard product buildout.
3. Major architecture migration away from SQLite in this phase.

## Task Breakdown

## E1. Access + Authorization Hardening

Description:
- Remove manual DB role edits by adding explicit role-management APIs and audit coverage.

Implementation tasks:
1. Add admin-only user role-management endpoints:
- read user role/status
- update user role/status (`admin`, `contributor`, `consumer`; `active`, `disabled`)
2. Add shared contract validators for role-management payloads.
3. Persist immutable audit entries for role/status changes.
4. Add smoke checks for:
- allowed admin role update path
- forbidden non-admin path
- changed role taking effect on protected endpoints

Acceptance criteria:
1. No manual DB role edits are required for standard role operations.
2. Role changes are auditable and reversible.
3. Authorization behavior changes immediately after role updates.

## E2. Cache + Recommendation Integrity

Description:
- Replace placeholder cache invalidation with deterministic invalidation behavior.

Implementation tasks:
1. Add in-process cache registry abstraction for recommendation-relevant reads.
2. Wire invalidation on all recommendation-affecting writes:
- governance updates
- prompt curation updates
- contributor submission/influence updates
- policy/config changes that affect ranking/selection
3. Add smoke coverage proving stale values are not served after writes.

Acceptance criteria:
1. Recommendation-affecting writes invalidate relevant caches consistently.
2. Post-write reads reflect fresh state without process restart.
3. Cache behavior is covered by repeatable smoke tests.

## E3. Backup/Restore + Queue Recovery

Description:
- Operationalize backup and recovery requirements from technical decisions.

Implementation tasks:
1. Add script(s) for SQLite backup creation and S3 upload with timestamped paths.
2. Add restore script and documented restore drill runbook.
3. Add backup integrity checks (existence + basic validation).
4. Validate queue retry/dead-letter monitoring and admin recovery/requeue workflows.

Acceptance criteria:
1. Backup and restore procedures are executable from documented commands.
2. Restore drill succeeds on a clean local/UAT validation flow.
3. Queue failure recovery paths are validated without manual DB edits.

## E4. Observability + Launch Gates

Description:
- Define objective launch gates backed by logs, smoke checks, and operational checks.

Implementation tasks:
1. Standardize structured logs for key flows with IDs (`request_id`, `job_id`, `analysis_run_id`).
2. Add operational checks for queue lag/dead-letter pressure and error-rate visibility.
3. Add minimal frontend critical-flow checks (beyond proxy-only where needed).
4. Publish consolidated launch runbook and pass/fail criteria.

Acceptance criteria:
1. Failure modes are observable from logs and operational checks.
2. Launch gate runbook is reproducible from clean checkout.
3. Epic E closeout artifacts clearly capture residual post-launch follow-ups.

## Recommended Sequence

1. E1 Access + Authorization Hardening (Completed 2026-02-20)
2. E2 Cache + Recommendation Integrity (Completed 2026-02-20)
3. E3 Backup/Restore + Queue Recovery (Completed 2026-02-20)
4. E4 Observability + Launch Gates (Completed 2026-02-20)

Rationale:
1. E1 removes current highest-friction operational risk.
2. E2 prevents correctness regressions under optimization.
3. E3 ensures recoverability.
4. E4 finalizes objective launch readiness criteria.

## Verification Runbook (Target End-State)

1. `npm run contracts`
2. `set -a; source .env.local.example; set +a`
3. `npm run db:reset`
4. Epic D regression smokes:
- `npm run admin:governance-smoke`
- `npm run admin:moderation-smoke`
- `npm run admin:prompt-curation-smoke`
- `npm run admin:approval-policy-smoke`
- `npm run contributor:essentials-smoke`
- `npm run admin:frontend-proxy-smoke`
5. Epic E smokes:
- `npm run admin:role-management-smoke` (implemented)
- `npm run cache:invalidation-smoke` (implemented)
- `npm run backup:restore-smoke` (implemented)
- `npm run queue:recovery-smoke` (implemented)
- `npm run frontend:critical-flow-smoke` (implemented)
- `npm run ops:checks` (implemented)
- `npm run launch:readiness-smoke` (implemented)

Expected:
1. All smoke scripts return `ok: true`.
2. Forbidden-path checks return stable `403` behavior.
3. Backup/restore and queue-recovery checks are reproducible and documented.

## Risks and Controls

1. Risk: role-management endpoint misuse.
Control: strict admin-only gating + immutable audits + smoke coverage.

2. Risk: cache invalidation misses one write path.
Control: centralized invalidation API + write-path checklist + targeted smoke.

3. Risk: backup process exists but restore fails in practice.
Control: recurring restore drill with explicit pass/fail criteria.

4. Risk: launch checklist is subjective.
Control: command-driven, measurable launch-gate runbook.
