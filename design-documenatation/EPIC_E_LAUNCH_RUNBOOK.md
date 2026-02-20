# Epic E Launch Readiness Runbook

Status: Draft  
Date: 2026-02-20

## Purpose

Provide command-driven launch gate checks with explicit pass/fail criteria.

## Preconditions

1. Environment loaded:
- `set -a; source .env.local.example; set +a`
2. Node available on PATH.
3. Local ports available for smoke scripts.

## Launch Gate Command

Full gate:

```bash
npm run launch:readiness-smoke
```

Quick gate (short cycle):

```bash
LAUNCH_SMOKE_SCOPE=quick npm run launch:readiness-smoke
```

## Direct Operational Check Command

```bash
npm run ops:checks
```

## Pass/Fail Criteria

Pass:
1. `launch:readiness-smoke` returns `ok: true`.
2. `ops:checks` returns `ok: true` and:
- queue lag <= configured threshold (`OPS_MAX_QUEUE_LAG_SEC`, default 300)
- dead-letter queued messages <= configured threshold (`OPS_MAX_DLQ_MESSAGES`, default 0)
- error-rate visibility check passes (or reports `insufficient_sample` warning, not failure)
3. Critical frontend flow smoke passes:
- `npm run frontend:critical-flow-smoke` returns `ok: true`

Fail:
1. Any smoke command exits non-zero.
2. `ops:checks` returns `ok: false`.
3. Launch smoke JSON contains non-null `failedStep`.

## Gate Composition (Full Scope)

1. Contracts + DB reset.
2. Epic D regression smokes:
- governance/moderation/prompt-curation/approval-policy/contributor/admin-frontend-proxy
3. Epic C feedback smokes:
- service + frontend proxy
4. Epic E smokes:
- role-management, cache invalidation, backup/restore, queue recovery
5. E4 additions:
- frontend critical-flow smoke
- operational checks

## Notes

1. In restricted/sandboxed environments, localhost bind/listen permissions may block smoke runs.
2. For non-local queue mode, `ops:checks` uses SQS queue attributes and reports error-rate visibility as externalized (warn-level note).
