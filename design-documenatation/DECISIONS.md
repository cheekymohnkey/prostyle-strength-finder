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

Status date: 2026-02-20

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

14. Active environment strategy is `local` + `prod`; `uat` remains an optional future environment.
Rationale: Keeps recurring infrastructure cost lower while preserving a clear path to add UAT later if risk/cost tradeoffs change.

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

20. MVP implementation epics A-E are completed and smoke-verified.
Rationale: Core delivery scope, hardening, and launch-readiness gates have been executed with passing reproducible checks.

21. Current database schema baseline is migration-driven SQLite and evolves only through versioned migrations.
Rationale: Epic implementation established executable migration workflows and applied baseline + feature migrations as the operational source of truth for MVP.

22. API contract baseline is versioned REST (`/v1/...`) with shared contract validators and smoke-verified endpoint behavior.
Rationale: API style and payload validation rules are now implemented and exercised across recommendation, feedback, and admin flows.

23. MVP hosting topology target is single-instance app/worker + SQLite with AWS S3/SQS, deploying to `prod` first while keeping `uat` as a future option.
Rationale: Deployment strategy is decided for current phase; S3/SQS foundations are provisioned, Lightsail compute provisioning remains pending, and UAT can be added later without architecture changes.

24. Style-DNA analysis will use paired MidJourney 2x2 grid comparison (baseline vs test) as a first-class workflow.
Rationale: Side-by-side delta analysis is required to isolate profile/sref influence from prompt and model baseline behavior.

25. The baseline/test parameter contract for Style-DNA analysis is fixed for controlled runs and persisted per analysis run.
Rationale: Objective comparison requires locked variables (seed, quality, stylize tier, style-raw toggle, and influence parameters) to avoid false assumptions.

26. Vision extraction responses for Style-DNA analysis must use strict structured JSON output from the LLM provider.
Rationale: Downstream parsing, taxonomy mapping, and auditability require deterministic machine-readable payloads without conversational variance.

27. Trait extraction strategy is hybrid: open-trait discovery at ingestion + canonical taxonomy mapping for production scoring.
Rationale: Strict taxonomy-only extraction misses nuance; open extraction without mapping causes synonym fragmentation.

28. Style-DNA baseline generation and comparison operations are admin-only workflows.
Rationale: Controlled execution and dataset quality are operational governance concerns, not general consumer flow.

29. Baseline grids are reusable assets keyed by MidJourney model family/version + fixed baseline parameter envelope, and should be created once then reused.
Rationale: Re-generating baseline controls for every new style influence is redundant and increases operator friction.

30. Style-DNA test flow uses stored style influences (srefs/moodboards) selected from system records, with system-generated paste-ready prompt variants.
Rationale: Prompt template consistency is required for repeatable comparisons and lowers manual formatting errors.

31. Admin uploads returned MidJourney test grids back into the app for queued analysis against the matching reusable baseline set.
Rationale: Keeps render execution external while preserving internal async analysis reliability/auditability.

### Open

1. Canonical trait taxonomy.
Notes: Still open for long-term taxonomy governance/versioning; does not block current MVP operation.

### Deferred

1. Exploratory recommendation features (`Roll the Dice`, `Surprise Me`) for post-MVP.
Rationale: Valuable for creative discovery, but not required to start MVP implementation.

2. Metric stack expansion beyond CloudWatch baseline (additional APM).
Rationale: Useful for deeper observability, but not required for MVP launch gates.

3. LocalStack vs AWS-dev-resource split for local pre-prod testing.
Rationale: Can start with current approach and tighten environment strategy later.

4. Final test-tooling selection details.
Rationale: Current smoke/unit/integration coverage is sufficient for MVP; tooling standardization can be iterated post-MVP.

5. Optional UAT compute environment activation.
Rationale: UAT is intentionally deferred to control recurring cost; enable when additional non-local pre-production validation is worth the spend.

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
