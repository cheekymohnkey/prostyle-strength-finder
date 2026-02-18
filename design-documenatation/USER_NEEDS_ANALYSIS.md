# Prostyle Strength Finder - User Needs Analysis (P0)

This document captures user needs before solution modeling.

Status: In progress  
Last updated: 2026-02-18  
Owners: Ryan + Codex

## Purpose

- Define who the product is for.
- Define what outcomes they need from a single session.
- Define what quality bar is "good enough" for different use cases.
- Provide rationale for each need so later design choices are traceable.

## Rules

1. No schema, architecture, or stack decisions are finalized until this document reaches `Status: Complete`.
2. Every captured need must include context and rationale.
3. Distinguish facts from assumptions; mark assumptions clearly.

## Scope

In scope:
- User types and their goals.
- Decision-making workflows (what choice the tool helps make).
- Precision vs speed tolerance.
- Input/output expectations.
- Failure impact and trust requirements.

Out of scope:
- Database schema details.
- API contract details.
- UI framework implementation details.
- Direct render job execution against MidJourney.

## Current Assumptions (to validate)

1. Users sometimes need precise prompt-fit scoring.
2. Users sometimes need fast "close enough" style-fit recommendations.
3. Users want profile strengths/leanings explained in plain language.
4. The main recommendation flow is available to all user types (U1, U2, U3).

## Product Constraints (confirmed)

1. The application does not submit or execute image render jobs.
2. The application provides recommendations and analysis outputs only.
3. MidJourney does not provide a public API for direct render job submission.
4. OpenAI image models do not support MidJourney-style profile/sref behavior.
5. Future render orchestration can be considered later, but it is not part of MVP.

## Shared Vocabulary (confirmed)

1. `Profile`: MidJourney profile code used as a style/control input in external generation tools.
2. `SREF`: MidJourney style reference input used in external generation tools.
3. `Baseline image`: image produced with zero profiles and zero srefs (default model behavior only).
4. `Combination`: any prompt configuration containing 0 or more profiles and 0 or more srefs.
5. `Recommendation flow`: analysis/ranking flow that outputs suggested profile/sref combinations; no rendering occurs in-app.

## Future-State Ideas (tracked, not MVP)

1. `Roll the Dice`
- Generates a fully random combination of profiles and srefs.
- Goal: fast exploration and discovery of unexpected styles.

2. `Surprise Me`
- Starts from a good-fit prompt/profile/sref setup.
- Injects 1-2 random profile/sref elements.
- Goal: preserve relevance while introducing novelty.

## User Types (working draft)

### User Type U1
Status: Draft  
Name: Application Administrator  
Context: Single operator (currently Ryan) responsible for quality, reliability, and system operation across the full workflow.  
Primary goals:
1. Use the main recommendation flow like any other user type.
2. Carry out all end-user actions when needed.
3. View and manage all analyses, including removal of problematic uploads/analyses.
4. Manage and curate trusted prompts that produce reliable trait analysis.
5. Remove or disable problematic profile codes.
6. Access debug and operational tooling to diagnose issues quickly.
7. Govern recommendation behavior from day one (pin/disable profiles, set confidence thresholds, control low-confidence fallback behavior).
8. Control analysis approval workflow with policy options:
- Auto-approve mode (default for solo operation).
- Manual approval mode (for later scale/team workflows).
Constraints (time/skill/tools):
1. Single-admin operation at this stage.
2. Needs low operational overhead and fast intervention paths.
3. Prefers configurable controls over heavy process requirements.
Rationale:
1. Admin needs full-system visibility and override capability to maintain trust in outputs.
2. Approval workflow must be configurable because strict manual review is unnecessary overhead right now.
3. Recommendation governance is high leverage and should be available early.
4. Deep data lifecycle administration (beyond practical cleanup policies) is intentionally deferred for MVP.

## Admin Task Catalog (U1)

Status: Draft

### AT-1 Analysis moderation
Trigger:
- Problematic upload or analysis is detected.
Inputs:
- Analysis ID(s), image ID(s), reason code, optional admin note.
Outputs:
- Item flagged, removed, or re-run queued.
- Audit log entry created.
Success criteria:
1. Admin can find and action target items quickly.
2. Removed/flagged items no longer affect recommendations.
3. Re-run status is visible until completion.

### AT-2 Profile/SREF governance
Trigger:
- Profile or sref is low quality, unsafe, outdated, or intentionally promoted.
Inputs:
- Profile/sref ID(s), action (`disable`, `remove`, `pin`, `unpin`), reason, optional scope.
Outputs:
- Governance state updated and reflected in recommendation ranking.
- Audit log entry created.
Success criteria:
1. Disabled items are excluded from default recommendation paths.
2. Pinned items are honored by ranking policy where applicable.
3. Governance changes are reversible.

### AT-3 Prompt set curation
Trigger:
- Trusted prompt list needs update for reliability/coverage.
Inputs:
- Prompt text, status (`active`, `deprecated`, `experimental`), version label, optional notes.
Outputs:
- Prompt catalog updated and versioned.
- Prompt availability reflected in analysis/recommendation workflows.
Success criteria:
1. Admin can maintain a high-trust prompt library.
2. Deprecated prompts are clearly marked and not used by default.
3. Prompt history/version is traceable.

### AT-4 Approval policy controls
Trigger:
- Review overhead or quality requirements change.
Inputs:
- Approval mode (`auto-approve`, `manual`), optional rule scope (source/type).
Outputs:
- New approval policy applied to incoming analyses.
- Pending queue behavior updates immediately.
Success criteria:
1. Solo operation can run with low-friction auto-approve.
2. Manual mode can be enabled later without workflow redesign.
3. Policy state is visible to admin at all times.

### AT-5 Debug and operations visibility
Trigger:
- Failures, latency spikes, or inconsistent outputs are observed.
Inputs:
- Time window, status filter, model/version filter, job ID.
Outputs:
- Run diagnostics (status, error reason, latency, model/version, retry controls).
Success criteria:
1. Admin can identify failed/stuck jobs quickly.
2. Retry action is available without raw backend access.
3. Core run metadata is sufficient for first-pass troubleshooting.

### AT-6 Audit trail
Trigger:
- Any high-impact admin action occurs.
Inputs:
- Actor, action type, target ID, timestamp, reason.
Outputs:
- Immutable audit record for governance actions.
Success criteria:
1. Admin can review who changed what and when.
2. High-impact actions are always traceable.
3. Audit records support post-incident review.

### User Type U2
Status: Draft  
Name: Profile Contributor  
Context: User who expands the system's profile library by uploading images and registering new profiles/srefs for analysis and recommendation use.  
Primary goals:
1. Use the main recommendation flow like any other user type.
2. Upload one or many images quickly.
3. Add new profile codes / srefs with minimal friction.
4. Trigger analysis for newly added profiles/srefs.
5. View resulting trait strengths and weaknesses for the new profile.
6. Iterate by adding more images to improve profile signal quality.
Constraints (time/skill/tools):
1. May not have deep technical knowledge of analysis internals.
2. Needs fast feedback loops after upload/add actions.
3. Should avoid direct access to admin-only governance/debug controls.
Rationale:
1. This role is the growth engine for profile coverage in the system.
2. Fast ingest + fast feedback increases dataset quality over time.
3. Separation from admin controls reduces accidental high-impact changes.

### User Type U3
Status: Draft  
Name: Recommendation Consumer  
Context: User who wants the best profile/sref suggestions for a prompt or creative direction, without managing datasets or system configuration.  
Primary goals:
1. Enter a prompt (and optionally references) and get usable profile/sref recommendations quickly.
2. Understand why each recommendation is suggested in plain language.
3. See confidence and risk notes before committing to a profile/sref.
4. Compare a small set of alternatives and pick one fast.
5. Browse a profile/sref library organized by traits, moods, and style families.
6. Filter and sort profile/sref options by fit confidence and known strengths.
7. Compare profile/sref options side-by-side before choosing.
8. Save favorites and reusable quick-pick sets.
9. See baseline-vs-profile delta summaries to understand expected impact.
10. Hide options they do not want recommended.
11. See "why not recommended" explanations for near-miss options.
12. Apply constraint locks (must-have / avoid traits) before ranking.
13. Reuse recent successful picks from session memory.
14. Export/share recommendation bundles (prompt + profile/sref + rationale + confidence).
Constraints (time/skill/tools):
1. Time-sensitive; prefers fast, decision-oriented output over deep diagnostics.
2. Does not need access to upload moderation, profile disabling, or debug tools.
3. Needs output clarity more than raw analysis detail.
Rationale:
1. This is the core value delivery role for the recommendation experience.
2. Clear rationale + confidence increases trust and reduces trial-and-error.
3. Restricting operational controls keeps this flow simple and focused.

## Jobs To Be Done (JTBD)

### JTBD-1
Status: Draft  
When: I have a prompt (and optionally reference images) and need to pick a profile/sref quickly.  
I want to: run a recommendation flow that suggests the best profile/sref options, with reasons, confidence, and potential prompt improvements.  
So I can: choose a profile/sref with less guesswork and fewer failed generations.  
Success signal:
1. I get ranked recommendations quickly.
2. Each recommendation includes clear "why this fits" signals.
3. I can choose precision mode or close-enough mode based on my intent.
4. I can apply suggested prompt improvements before generation.
5. I can select a recommendation and move directly into generation.
6. After generation, I can upload the result image and receive alignment feedback (expected vs observed outcome).
Rationale:
1. This is the core workflow shared by U1, U2, and U3.
2. Reducing trial-and-error is the highest value outcome for most sessions.
3. Prompt-improvement and post-result feedback strengthen the loop from recommendation to better outcomes.

### JTBD-2
Status: Draft  
When: I want to explore outside predictable recommendations without manually testing many variants.  
I want to: use exploratory suggestion modes (for example, random or semi-random combinations) to generate novel profile/sref ideas.  
So I can: discover unexpected but potentially useful stylistic directions faster.  
Success signal:
1. I can trigger exploratory suggestions in one action.
2. Suggestions are clearly labeled as exploratory vs reliable-fit.
3. I can quickly save or discard exploration results.
Rationale:
1. Exploration is a distinct user need from strict best-fit recommendation.
2. Controlled randomness can increase creative range without replacing precision mode.

### JTBD-3
Status: Open  
When:  
I want to:  
So I can:  
Success signal:  
Rationale:

## Main Recommendation Flow (All User Types)

Status: Draft

### Flow goal

Help any user (U1/U2/U3) move from prompt to a confident profile/sref choice with minimal friction.

### Step-by-step flow

1. Start recommendation
- User enters prompt text.
- Optional inputs: reference images, constraints, or desired style direction.
- Optional discovery path: browse trait-organized profile/sref library before or after entering prompt.

2. Choose recommendation mode
- `Precision`: prioritize strict prompt-fit.
- `Close enough`: prioritize fast, usable stylistic fit.
- System can provide a default mode, but user can switch before run.

3. Run analysis and matching
- System interprets prompt intent.
- System evaluates candidate profiles/srefs.
- System ranks candidates with confidence and risk notes.

4. Present recommendations
- Show top candidates (small list, e.g., top 3-5).
- For each: fit rationale, dominant traits, potential risks/failure notes, confidence.
- Provide suggested prompt improvements for each recommended option.
- Support side-by-side comparison and baseline-vs-profile delta summaries.
- Allow saving favorites/quick-pick sets and hiding unwanted options.
- Provide "why not recommended" reasoning for near-miss candidates.
- Respect user constraint locks (must-have / avoid traits) during ranking.
- Support recent-session reuse and export/share of recommendation bundles.

5. Decide and continue
- User selects one option.
- System provides copyable profile/sref output and optional prompt adjustments.
- User runs generation outside this app (manual handoff).

6. Post-result feedback (alignment check)
- User optionally uploads the generated result image.
- System evaluates whether observed output aligns with expected trait behavior of selected profile/sref combination.
- System returns alignment summary and mismatch signals.
- System provides possible prompt adjustment suggestions.
- System can also provide alternative profile/sref recommendation(s) alongside prompt adjustments.

7. Capture feedback (lightweight)
- User can mark recommendation/alignment feedback as useful or not useful.
- Feedback informs future ranking and suggestion improvements.
- User can provide emoji sentiment feedback:
  - `🙂` positive: strengthens confidence in observed trait behavior.
  - `☹️` negative: weakens confidence in observed trait behavior.
- Weighting rule:
  - Emoji + uploaded result image: normal impact.
  - Emoji without uploaded result image: very minor impact.
- Confidence updates from feedback should be bounded to avoid unstable swings.

### Role behavior in this flow

1. U1 (Admin): uses same flow + can apply governance controls if needed.
2. U2 (Profile Contributor): uses same flow + can add new profile/sref candidates after gaps are observed.
3. U3 (Recommendation Consumer): uses same flow only; no management/debug controls.

### Flow acceptance criteria (working draft)

1. Time to first recommendation is within acceptable latency for selected mode.
2. Recommendations include rationale and confidence for every surfaced option.
3. Users can switch between precision and close-enough without leaving the flow.
4. Prompt-improvement suggestions are available before user handoff to generation.
5. Users can optionally upload generated results for expected-vs-observed alignment feedback.
6. Post-result feedback can suggest both prompt adjustments and alternative profile/sref options.
7. Users can complete decision in one session without needing admin intervention.
8. Flow is identical at core across all user types; only side controls differ by role.
9. Emoji feedback is supported, with materially higher influence when accompanied by an evidentiary image.

## Decision Moments

For each decision type, define what the tool must help the user decide.

### DM-1: Profile selection
Status: Open  
Decision:  
Inputs available:  
Output needed:  
Confidence requirement:  
Rationale:

### DM-2: Prompt refinement
Status: Open  
Decision:  
Inputs available:  
Output needed:  
Confidence requirement:  
Rationale:

### DM-3: Style exploration
Status: Open  
Decision:  
Inputs available:  
Output needed:  
Confidence requirement:  
Rationale:

## Precision vs Speed Policy

### Use case matrix (working draft)

1. Precision-critical tasks
- Examples:
- Acceptable latency:
- Minimum confidence:
- Failure cost:
- Rationale:

2. Close-enough tasks
- Examples:
- Acceptable latency:
- Minimum confidence:
- Failure cost:
- Rationale:

## Input and Output Needs

### Inputs users can realistically provide
Status: Open

1. Prompt text only
2. Prompt + reference images
3. Existing profile examples
4. Batch uploads
5. Historical analysis results

Context:
Rationale:

### Outputs users find actionable
Status: Open

1. Ranked profile recommendations
2. Plain-language "why this fits"
3. Dominant traits and anti-traits
4. Risk notes / likely failure modes
5. Confidence signal

Context:
Rationale:

## Failure and Trust

### Failure impact categories

1. Low impact
Context:
Rationale:

2. Medium impact
Context:
Rationale:

3. High impact
Context:
Rationale:

### Trust requirements
Status: Open

1. Explainability needed:
2. Confidence visibility needed:
3. Reproducibility needed:
4. Human override needed:
Rationale:

## Open Questions

1. Which user type is primary for MVP?
2. Is "close enough" the default mode or optional mode?
3. What is the minimum acceptable confidence for showing recommendations?
4. Should we optimize first for learning speed or decision accuracy?

## Completion Criteria (P0 Done)

Mark P0 complete only when all are true:

1. At least 2 user types are fully specified and agreed.
2. At least 3 JTBD statements are agreed and testable.
3. Precision-vs-speed policy is explicit with examples.
4. Input/output requirements are agreed for MVP.
5. Failure/trust requirements are agreed.
6. `DECISIONS.md` updated with the completion date and move to P1.
