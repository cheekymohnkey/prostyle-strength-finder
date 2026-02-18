# Prostyle Strength Finder - MVP Path

Status: Agreed  
Date: 2026-02-18  
Depends on: `design-documenatation/DECISIONS.md`, `design-documenatation/USER_NEEDS_ANALYSIS.md`
Approved on: 2026-02-18

## Goal

Deliver a usable first release that helps users pick profile/sref combinations confidently, with clear rationale and a lightweight feedback loop.

## MVP Definition

MVP is considered usable when:

1. All user types (U1/U2/U3) can complete the core recommendation flow.
2. Recommendations include rationale and confidence.
3. Prompt improvement suggestions are provided.
4. Users can upload generated output for expected-vs-observed alignment feedback.
5. Basic admin controls exist for moderation and recommendation governance.

## Scope Boundaries

In MVP:
- Recommendation and analysis outputs only.
- No in-app render job execution.
- Manual handoff to external generation tools.

Out of MVP:
- MidJourney render orchestration/API integration.
- Advanced experimentation frameworks.
- Deep data lifecycle tooling beyond practical cleanup.
- Exploratory modes (`Roll the Dice`, `Surprise Me`) unless explicitly pulled forward.

## MVP Architecture Gate (Required)

Before implementation starts, the following must exist and be accepted:

1. High-level ERD covering current U1/U2/U3 use cases.
2. Application architecture design with clear layer boundaries.
3. Explicit engineering principles aligned to SOLID/DRY.
4. Traceability from user needs -> flows -> data entities -> application components.

## Phase Plan

## MVP-1 Core Recommendation Flow

Objective:
- Ship the main end-user flow from prompt input to recommended profile/sref output.

Includes:
1. MidJourney PNG upload input with automatic metadata extraction (prompt and run metadata).
2. Mode selection (`Precision`, `Close enough`).
3. Ranked recommendations (top list).
4. Fit rationale + confidence + risk notes.
5. Prompt improvement suggestions.
6. Copyable output for manual generation handoff.
7. Required extraction confirmation step before recommendation submission finalization.

Exit criteria:
1. User can complete flow in one session.
2. Recommendations are understandable without admin help.
3. Extracted metadata is reviewable and confirmed before submission.

## MVP-2 Feedback Loop

Objective:
- Close the learning loop after external generation.

Includes:
1. Optional generated-image upload.
2. Expected-vs-observed alignment check.
3. Prompt adjustment suggestions from mismatch.
4. Alternative profile/sref suggestions from mismatch.
5. Emoji sentiment feedback:
- `🙂` positive, `☹️` negative.
- Image + emoji has normal impact.
- Emoji-only has minor impact.
- Confidence updates are bounded.

Exit criteria:
1. User can submit post-result feedback in under 1 minute.
2. System returns actionable next-step guidance.

## MVP-3 Admin + Contributor Essentials

Objective:
- Provide minimum governance and ingestion controls needed to operate safely.

Includes:
1. U1 admin task essentials:
- Analysis moderation (flag/remove/re-run).
- Profile/sref governance (disable/pin/unpin).
- Prompt set curation (active/deprecated/experimental).
- Approval mode control (`auto-approve` default, `manual` available).
- Basic diagnostics + retry.
2. U2 contributor essentials:
- Upload/add profile-sref, trigger analysis.
- View processing status.
- Retry own failed submissions.

Exit criteria:
1. Admin can keep low-quality/problematic entries out of active recommendations.
2. Contributor can add and iterate profile/sref entries without admin intervention for normal cases.

## Success Metrics (Initial Targets)

These are starter targets and can be adjusted after first usage data.

1. Core flow completion rate: >= 80% of sessions reach recommendation output.
2. Time to first recommendation:
- `Close enough`: <= 20s target.
- `Precision`: <= 45s target.
3. Recommendation usefulness signal:
- >= 60% positive feedback (`🙂` or useful mark) after first iteration.
4. Feedback loop usage:
- >= 25% of recommendation sessions submit optional post-result feedback.
5. Admin intervention rate:
- <= 20% of contributor submissions require admin correction.

## Risks and Controls

1. Risk: Confidence appears precise but is misleading.
Control: Show confidence with rationale + risk notes, not as standalone truth.

2. Risk: Feedback noise from low-evidence emoji-only input.
Control: Keep emoji-only weighting intentionally low.

3. Risk: Moderation overhead for single admin.
Control: Default to `auto-approve`, keep manual mode optional.

## Open Items Before Execution

None currently.

Resolved on 2026-02-18:
1. Latency/confidence targets accepted.
2. MVP-3 admin must-have scope confirmed.
3. P0 user-needs status marked complete/agreed.

## Ready-to-Build Checklist

Move from design to implementation when all are true:

1. P0 user-needs document marked complete.
2. MVP phase scope accepted.
3. Success metrics accepted (or revised).
4. High-level ERD approved.
5. Architecture principles/design approved.
6. Open items resolved or explicitly deferred.
