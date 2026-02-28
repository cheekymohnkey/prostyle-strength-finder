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
4. Style-DNA run-flow contract evidence passes:
- `set -a && source .env.local && set +a && npm run style-dna:run-smoke`
- `set -a && source .env.local && set +a && npm run style-dna:prompt-generation-smoke`
- `set -a && source .env.local && set +a && npm run admin:frontend-proxy-smoke`
- `npm run contracts`
- run-smoke output preserves SDNA-11 invariants (audit submit/list/get, invalid status-filter contract, queue-unavailable contract, idempotency/lifecycle observability).

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
6. Style-DNA run-flow hardening evidence checks:
- run submit/list/get audit invariant assertions
- invalid run-list status filter contract assertions
- queue-unavailable submit contract assertions
- idempotency + lifecycle observability assertions

## SDNA-37 Provenance Receipt Operator Guidance

When `STYLE_DNA_REQUIRE_PROVENANCE_RECEIPT=true`, all Style-DNA image uploads (`POST /v1/admin/style-dna/images`) must include `provenanceReceipt`.

Required provenance fields:
1. `source` (string)
2. `capturedAtUtc` (ISO-8601 UTC timestamp)
3. `operatorAssertion` (nullable string; include field explicitly)

Recommended source values:
1. `studio_manual_upload` (admin studio uploads)
2. `midjourney_manual_export` (direct operator export flow)
3. `operator_upload_unverified` (local/dev fallback only; avoid in prod handoff evidence)

Operator assertion examples:
1. `baseline_grid_uploaded_via_studio:<filename>`
2. `test_grid_uploaded_via_studio:<filename>`
3. `grid captured from MJ job console export`

Strict-mode rollout checklist:
1. Verify `.env` includes `STYLE_DNA_REQUIRE_PROVENANCE_RECEIPT=true` for target env.
2. Verify admin UI uploads include `provenanceReceipt` in payload.
3. Run `set -a && source .env.local && set +a && STYLE_DNA_REQUIRE_PROVENANCE_RECEIPT=true npm run style-dna:baseline-smoke`.
4. Confirm strict-policy rejection path still returns `400 INVALID_REQUEST` for missing receipt.
5. Confirm handover evidence block includes digest + provenance tuple fields.

## Style-DNA Baseline AR Audit (Prod)

Use this read-only audit before or after deploy when prompt AR behavior appears inconsistent.

Command:
1. `set -a && source .env.prod && set +a && npm run style-dna:baseline-ar-audit -- --modelFamily standard --modelVersion 7 --expectedAr 16:9 --expectedTiers 0,100,1000 --failOnMismatch true`

Output interpretation:
1. `ok=true` means all expected tiers exist with expected AR.
2. `checks.missingExpectedTiers` lists stylize tiers with no baseline set for the selected model/version.
3. `checks.mismatchedExpectedTiers` lists tiers where expected AR is absent.
4. `checks.mixedAspectRatiosAtExpectedTiers` flags data hygiene drift (multiple AR values at same model/version/stylize tier).

Operational note:
1. If mixed AR sets exist, Studio may still be operator-confusing even with AR preference logic; clean up or deprecate stale baseline sets to restore deterministic selection behavior.

## Notes

1. In restricted/sandboxed environments, localhost bind/listen permissions may block smoke runs.
2. For non-local queue mode, `ops:checks` uses SQS queue attributes and reports error-rate visibility as externalized (warn-level note).
