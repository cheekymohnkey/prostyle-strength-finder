# FR - Style-DNA Admin Workflow

Status: Draft  
Date: 2026-02-23

## Scope

Covers admin-only baseline creation/reuse, prompt generation, run submission, worker processing, and result retrieval.

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

## User Acceptance Criteria

1. Admin can execute full baseline-to-run-to-result flow without direct DB/API manipulation.
2. Incompatible or incomplete baseline state prevents run submission with actionable errors.
3. Repeat submissions with same idempotency key return existing run.
