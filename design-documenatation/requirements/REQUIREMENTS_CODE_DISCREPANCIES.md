# Requirements vs Code Discrepancies

Status: Draft  
Date: 2026-02-24

## Method

Compared current requirements/planning docs against implemented code paths in API, worker, shared contracts, migrations, and smoke scripts.

## Confirmed Discrepancies

1. `DISC-002` Canonical trait mapping and discovery-mode governance are partially implemented.
- Requirement source: Style-DNA plan + FR require open-vocabulary atomic extraction, deterministic normalization, embedding-assisted candidate snapping, threshold-gated auto-merge, review routing, and taxonomy-versioned decisions.
- Current implementation: worker now runs normalization/canonicalization with alias and discovery persistence, and admin review endpoints/UI are present for unresolved traits. Remaining gap: semantic similarity currently uses deterministic proxy scoring instead of true embedding-model similarity; taxonomy seeding and governance breadth are still limited (`apps/worker/src/index.js`, `scripts/inference/style-dna-canonicalizer.js`, `apps/api/src/index.js`, `apps/frontend/app/admin/style-dna/page.tsx`).
- Impact: core synonym-fragmentation controls now exist, but high-fidelity semantic snapping and mature taxonomy operations are not fully complete.

2. `DISC-003` Run submission locked-envelope parity is implemented with residual trust limitations.
- Requirement source: plan states baseline reuse/comparisons are tied to locked envelope matching.
- Current implementation: run submit now requires `submittedTestEnvelope` and enforces parity for model/version, stylize tier, and locked baseline envelope fields with explicit `mismatchFields` (`apps/api/src/index.js`, `packages/shared-contracts/src/style-dna-admin.js`, `apps/frontend/app/admin/style-dna/page.tsx`).
- Impact: server-side process parity is now materially stronger; remaining limitation is authenticity of externally rendered test evidence cannot be cryptographically proven from Midjourney output alone.

## Recently Resolved

1. `DISC-005` Section 3 direct admin create-new Style Influence flow from Midjourney ID input.
- Resolution: Admin list/create style influence API endpoints were added and wired into Section 3 with `Create New` + auto-select behavior.
- Files: `apps/api/src/index.js`, `scripts/db/repository.js`, `apps/frontend/app/admin/style-dna/page.tsx`.
2. `DISC-001` Style-DNA payload contracts shared in `packages/shared-contracts`.
- Resolution: Style-DNA admin payload validators are now defined/exported in shared contracts and consumed by API instead of API-local duplicates.
- Files: `packages/shared-contracts/src/style-dna-admin.js`, `packages/shared-contracts/src/index.js`, `apps/api/src/index.js`.
3. `DISC-004` Section 3 run contract modeling of per-run `styleWeight`.
- Resolution: run submit payload now carries `submittedTestEnvelope.styleWeight` and server validates it for `sref` workflows.
- Files: `packages/shared-contracts/src/style-dna-admin.js`, `apps/api/src/index.js`, `apps/frontend/app/admin/style-dna/page.tsx`.

## Documentation Drift Fixed in This Change

1. Old root-level implementation-plan/task document paths were moved to `design-documenatation/implementation/` and references updated.

## Resolved in This Change

1. `DISC-006` Section 3 remove/delete style influence gap.
- Resolution: Section 3 now exposes `Remove Selected`, backed by admin governance remove API and active-list refresh.
- Files: `apps/frontend/app/admin/style-dna/page.tsx`.
2. Requirements are now documented in dedicated functional/non-functional trees.

## Recommended Resolution Order

1. Add shared Style-DNA contracts/validators in `packages/shared-contracts` and consume from API/worker/frontend.
2. Implement explicit canonical taxonomy mapping pipeline (normalization + deterministic/alias resolution + embedding candidate snapping + threshold/review gating + versioned decisions).
3. Complete DISC-002 remaining work: integrate real embedding similarity and mature taxonomy governance workflows.
