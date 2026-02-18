# Prostyle Strength Finder - Decision Log

This file is the source of truth for product and technical decisions.

## How to use this file

- Only items under `Decided` are considered active constraints.
- Anything under `Open` is not settled and must not be treated as final.
- Use this file before making architecture/schema/tooling changes.
- Update this file first when a decision is made, then implement.

## Decision Rules

1. Design before implementation.
2. P0 user needs analysis is a hard gate before modeling, schema, or architecture decisions.
3. No schema lock-in until explicitly marked `Decided`.
4. No stack lock-in (UI/backend/db) until explicitly marked `Decided`.
5. Favor reversible decisions early.
6. Record rationale and tradeoffs for each decision.

## Current State

Status date: 2026-02-18

### Decided

1. Design/discovery gate is complete; implementation execution is active.
Rationale: P0 analysis, architecture, technical decisions, and implementation sequencing are approved and execution is in progress.

2. This project has two distinct problem spaces:
- Precision prompt-fit analysis.
- Trait-first profile strengths analysis.
Rationale: Different user intents and scoring behavior.

3. `DECISIONS.md` is the canonical decision record.
Rationale: Keep one shared, explicit source of truth.

4. P0 is user needs analysis, and it must be completed first.
Rationale: We cannot model solution structure without validated user needs.

5. User needs are documented in `USER_NEEDS_ANALYSIS.md`.
Rationale: Keep discovery artifacts separate from design decisions while remaining linked.

6. MVP scope ends at recommendation and analysis output; no render job submission/execution.
Rationale: MidJourney has no public render API, and OpenAI models do not use MidJourney-style profile/sref controls.

7. Shared vocabulary includes `baseline image` = 0 profiles + 0 srefs (default model behavior).
Rationale: Reduces ambiguity in analysis and recommendation discussions.

8. MVP delivery plan is documented in `design-documenatation/MVP_PATH.md`.
Rationale: Keep phased scope and readiness criteria explicit before implementation resumes.

9. MVP requires a high-level ERD and architecture principles/design before build execution.
Rationale: Ensure SOLID/DRY-aligned implementation from day 1 and avoid structural rework.

10. P0 user-needs analysis is complete and agreed.
Rationale: User types, JTBDs, mode thresholds, and trust requirements are now explicit and approved.

11. Recommendation mode thresholds are agreed:
- `precision >= 0.65`
- `close enough >= 0.45`
Rationale: Enables consistent low-confidence handling and ranking behavior.

12. Remaining technical blockers from `design-documenatation/TECHNICAL_DECISIONS.md` are resolved.
Rationale: Build can proceed without unresolved technical prerequisites.

13. Implementation sequence is documented in `design-documenatation/IMPLEMENTATION_PLAN.md`.
Rationale: Execution can proceed with an agreed epic/task dependency structure.

14. Non-local environment strategy is fixed to exactly two environments for now: `uat` and `prod`.
Rationale: Keeps operational surface area small while supporting safe pre-production and production separation.

15. AWS storage and queue foundations are provisioned and live-verified via Terraform.
Rationale: Non-local S3/SQS prerequisites are now reproducible through IaC and validated with live smoke tests.

16. Prompt model versioning rules are explicit and persisted per run/job.
Rationale: MidJourney model families/versions evolve independently; we must capture resolved model family/version deterministically for auditability and reproducibility.

17. MVP-1 recommendation intake path is upload-only.
Rationale: Minimize manual user input by extracting prompt and run metadata directly from MidJourney PNG metadata fields.

18. MVP-1 requires explicit user confirmation of extracted metadata before recommendation submission is finalized.
Rationale: Early parser confidence is still maturing; required confirmation reduces silent extraction errors.

19. Raw extracted metadata payloads are retained.
Rationale: Enables future reprocessing with updated parsing rules without requiring users to re-upload historical files.

### Open

1. Canonical trait taxonomy.
Notes: Needs a stable trait set and versioning strategy before schema finalization.

### Deferred

1. Final database schema.
Blocked by: storage decision + trait taxonomy finalization.

2. API contract definitions.
Blocked by: backend architecture + UX flow decisions.

3. Production hosting topology.
Blocked by: stack decisions and expected usage patterns.

4. Exploratory recommendation features (`Roll the Dice`, `Surprise Me`) for post-MVP.
Rationale: Valuable for creative discovery, but not required to start MVP implementation.

## Decision Template (copy/paste)

```md
### [Decision Title]
Status: Decided | Open | Deferred
Date: YYYY-MM-DD
Owner: <name>

Context:
- Why this decision is needed now.

Decision:
- What is being chosen.

Rationale:
- Why this option over alternatives.

Tradeoffs:
- Pros
- Cons

Follow-ups:
- Next actions created by this decision.
```
