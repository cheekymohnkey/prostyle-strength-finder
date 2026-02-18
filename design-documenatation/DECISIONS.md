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

1. We are in design/discovery mode, not implementation-first mode.
Rationale: Prevent premature commitment and rework.

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

### Open

1. UI framework choice.
Options discussed: Streamlit, React/Next.js, other.
Notes: Streamlit is fast to ship but can feel chatty/re-render heavy.

2. Data storage strategy.
Options discussed: JSON files, SQLite, Postgres (+ possible vector extension), hybrid.
Notes: Need to balance speed, queryability, and migration cost.

3. Backend architecture shape.
Options discussed: lightweight scripts, API service, async job workers.
Notes: Depends on expected scale and UX requirements.

4. Canonical trait taxonomy.
Notes: Needs a stable trait set and versioning strategy before schema finalization.

5. Recommendation mode behavior.
Notes: Need explicit rules for "precision" vs "close enough" ranking.

6. Exploratory recommendation features (`Roll the Dice`, `Surprise Me`) for post-MVP.
Notes: Valuable for creative discovery, but must be separated from reliability-focused recommendations.

### Deferred

1. Final database schema.
Blocked by: storage decision + trait taxonomy finalization.

2. API contract definitions.
Blocked by: backend architecture + UX flow decisions.

3. Production hosting topology.
Blocked by: stack decisions and expected usage patterns.

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
