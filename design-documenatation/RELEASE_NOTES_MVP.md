# Prostyle Strength Finder - MVP Release Notes

Status: Draft  
Date: 2026-02-20

## Release Summary

MVP scope is implemented across Epics A-E with launch-readiness smoke gates passing.

## What Shipped

1. Epic A: Platform foundation (repo structure, shared contracts, DB migration framework, API/worker baseline, env contract, S3/queue foundations).
2. Epic B: Core recommendation flow (upload metadata extraction, confirmation gate, recommendation generation, rationale/risk/prompt improvements, frontend MVP-1 flow).
3. Epic C: Feedback loop (feedback contracts, persistence, upload intake, alignment/evaluation scaffold, API + frontend feedback panel).
4. Epic D: Admin and contributor essentials (governance, moderation, prompt curation, approval policy, contributor upload/status/retry).
5. Epic E: Hardening and launch readiness (role management hardening, cache invalidation, backup/restore + queue recovery, operational checks, launch gate smoke).

Primary evidence:
1. `design-documenatation/implementation/EPIC_A_IMPLEMENTATION_TASKS.md`
2. `design-documenatation/implementation/EPIC_B_IMPLEMENTATION_TASKS.md`
3. `design-documenatation/implementation/EPIC_C_IMPLEMENTATION_TASKS.md`
4. `design-documenatation/implementation/EPIC_D_IMPLEMENTATION_TASKS.md`
5. `design-documenatation/implementation/EPIC_E_IMPLEMENTATION_TASKS.md`

## Launch Gate Status

Most recent recorded full-scope launch gate:
1. `npm run launch:readiness-smoke`
2. Result: `ok: true`, `scope: full`, `failedStep: null`

Operational checks:
1. `npm run ops:checks` is part of Epic E launch gate policy and passing in latest recorded run.

Runbook references:
1. `design-documenatation/EPIC_E_LAUNCH_RUNBOOK.md`
2. `design-documenatation/LAUNCH_CHECKLIST.md`

## Known Limitations

1. Recommendation ranking is deterministic scaffold logic; model-quality tuning remains post-MVP.
2. PNG metadata parsing is dependent on available MidJourney text/XMP metadata patterns; broader variant coverage is still needed.

Reference:
1. `design-documenatation/implementation/EPIC_B_IMPLEMENTATION_TASKS.md`

## Deferred / Post-MVP Backlog

1. Canonical trait taxonomy governance/versioning finalization.
2. Exploratory recommendation features (`Roll the Dice`, `Surprise Me`).
3. Metric stack expansion beyond CloudWatch baseline.
4. LocalStack vs AWS-dev-resource split for local pre-prod testing.
5. Final test-tooling standardization details.

Reference:
1. `design-documenatation/DECISIONS.md`
2. `design-documenatation/TECHNICAL_DECISIONS.md`

## Compatibility / Scope Notes

1. MVP excludes MidJourney render job submission/execution.
2. Current implementation baseline uses SQLite + AWS S3/SQS foundations; Lightsail deployment remains a planned target and is not yet provisioned in this repo.
3. Active environment strategy is `local` + `prod`; `uat` is retained as an optional future environment.

## Post-MVP Patch Updates

Date: 2026-02-25

1. Added admin baseline set deletion endpoint with cascade cleanup across baseline items, style-DNA prompt/run artifacts, linked style-DNA analysis artifacts, audit references, and orphan style-DNA image records.
2. Added admin UI control in Style-DNA page for deleting selected baseline sets with confirmation and cache invalidation.
3. Added dedicated regression smoke: `npm run style-dna:baseline-delete-cascade-smoke` and wired it into `style-dna:smokes:with-restore`.
