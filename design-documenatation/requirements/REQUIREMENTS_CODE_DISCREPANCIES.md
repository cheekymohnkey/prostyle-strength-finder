# Requirements vs Code Discrepancies

Status: Draft  
Date: 2026-02-23

## Method

Compared current requirements/planning docs against implemented code paths in API, worker, shared contracts, migrations, and smoke scripts.

## Confirmed Discrepancies

1. `DISC-001` Style-DNA payload contracts are not in `packages/shared-contracts`.
- Requirement source: Style-DNA task doc says shared validators should be added in `packages/shared-contracts`.
- Current implementation: validators are implemented in API service only (`apps/api/src/index.js`) and are not exported by shared contracts (`packages/shared-contracts/src/index.js`).
- Impact: frontend/worker cannot consume a shared typed contract for Style-DNA payloads, increasing drift risk.

2. `DISC-002` Canonical trait mapping policy is only minimally implemented.
- Requirement source: Style-DNA plan defines alias normalization/squashing and taxonomy mapping workflow.
- Current implementation: worker stores atomic traits and a small canonical snapshot (`dominantDnaTags`, `vibeShift`, `deltaStrength`) without alias registry/synonym merge flow (`apps/worker/src/index.js`).
- Impact: taxonomy-governance requirements are only partially met; synonym fragmentation risk remains.

3. `DISC-003` Run submission does not fully validate the locked parameter envelope beyond control-policy and prompt-tier coverage.
- Requirement source: plan states baseline reuse/comparisons are tied to locked envelope matching.
- Current implementation: run submit checks `styleWeight=0` for `sref` and baseline prompt+tier coverage, but does not compare a submitted test envelope object because it is not part of run payload (`apps/api/src/index.js`).
- Impact: server cannot independently prove full envelope parity at submit-time; this remains process/UI-driven.

## Documentation Drift Fixed in This Change

1. Old root-level implementation-plan/task document paths were moved to `design-documenatation/implementation/` and references updated.
2. Requirements are now documented in dedicated functional/non-functional trees.

## Recommended Resolution Order

1. Add shared Style-DNA contracts/validators in `packages/shared-contracts` and consume from API/worker/frontend.
2. Implement explicit canonical taxonomy mapping module (alias resolution + versioned decisions).
3. Extend run payload/validation to include test-side envelope evidence, then enforce full parity checks server-side.
