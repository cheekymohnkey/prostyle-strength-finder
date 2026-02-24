# FR - Style-DNA Admin Workflow

Status: Draft  
Date: 2026-02-24

## Scope

Covers admin-only baseline creation/reuse, prompt generation, run submission, worker processing, and result retrieval.

Section-specific extension:
1. Section 3 comparison UX parity requirements are specified in:
- `design-documenatation/requirements/functional/FR-STYLE_DNA_SECTION3_COMPARISON_FIX.md`
2. Section 3 matrix families and cell-level progress tracking are part of the active requirements baseline.

## Requirements

1. `FR-SD-001` Style-DNA endpoints and UI shall be admin-only.
2. `FR-SD-002` Baseline sets shall be reusable by compatibility key (model family/version, suite, envelope hash).
3. `FR-SD-003` Baseline items shall be attachable per prompt key and stylize tier (`0|100|1000`).
4. `FR-SD-004` Prompt generation shall produce deterministic copy-ready prompt lines.
5. `FR-SD-005` Prompt generation shall support adjustment type `sref|profile` and include selected stylize tiers.
6. `FR-SD-006` Run submission shall enforce idempotency by key.
7. `FR-SD-007` Run submission shall require baseline prompt+tier coverage.
8. `FR-SD-008` `sref` runs shall require matched control baseline (`styleWeight=0`).
9. `FR-SD-009` Worker processing shall persist raw LLM output and structured result artifacts.
10. `FR-SD-010` Style-DNA run lifecycle shall expose `queued`, `in_progress`, terminal (`succeeded|failed|dead_letter`).
11. `FR-SD-011` Frontend shall gate invalid actions with explicit prerequisite reasons.
12. `FR-SD-012` Admin workflow shall include an in-UI path to create new Style Influence records (for new Midjourney IDs) without requiring contributor submission flow or direct database edits.
13. `FR-SD-013` Admin workflow shall include in-UI removal of incorrectly created Style Influence records, with auditable governance semantics and immediate replacement path.
14. `FR-SD-014` Vision extraction shall use open-vocabulary atomic trait phrases (short visual evidence strings) and shall not force full enum taxonomy selection at inference time.
15. `FR-SD-015` Worker canonicalization shall normalize extracted traits and resolve to canonical taxonomy using deterministic matching first, followed by embedding-assisted candidate snapping.
16. `FR-SD-016` Automatic alias-to-canonical merge shall require configured lexical and embedding thresholds; otherwise traits shall be routed to review without automatic canonical enrollment.
17. `FR-SD-017` Production scoring/read models shall use canonical traits only; unresolved open traits shall be retained as discovery candidates pending governance approval.
18. `FR-SD-018` Canonicalization and alias decisions shall be versioned and auditable (`taxonomy_version`, decision source, timestamp, reviewer when manual).

## User Acceptance Criteria

1. Admin can execute full baseline-to-run-to-result flow without direct DB/API manipulation.
2. Incompatible or incomplete baseline state prevents run submission with actionable errors.
3. Repeat submissions with same idempotency key return existing run.
4. Trait synonyms do not fragment reporting because unresolved or ambiguous traits are review-gated instead of silently creating canonical duplicates.
