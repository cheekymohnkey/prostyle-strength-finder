# Prostyle Strength Finder - Architecture and High-Level ERD

Status: Agreed  
Date: 2026-02-18  
Purpose: Define a high-level data model and architecture principles before implementation.
Approved on: 2026-02-18

## Design Principles (Build Contract)

1. Single Responsibility
- Each module/service has one clear reason to change.

2. Open/Closed
- Extend scoring/analysis behavior via strategies, not core rewrites.

3. Liskov Substitution
- Provider adapters must be swappable behind stable interfaces.

4. Interface Segregation
- Small focused interfaces for analysis, storage, recommendation, moderation.

5. Dependency Inversion
- Core domain/application logic depends on ports, not external SDKs.

6. DRY
- One canonical representation for core concepts (profile, sref, analysis run, recommendation result).

7. Auditability by default
- High-impact actions and scoring inputs/outputs must be traceable.

## High-Level Application Architecture

1. Presentation Layer
- User-facing UI flows for U1/U2/U3.
- Role-based controls (same core recommend flow, different governance controls).

2. Application Layer
- Use-case orchestration:
  - RunRecommendation
  - ProcessFeedback
  - ManageProfileSref
  - ModerateAnalysis
  - CuratePrompts

3. Domain Layer
- Business logic and policies:
  - recommendation modes (precision/close-enough)
  - feedback weighting rules
  - governance rules

4. Infrastructure Layer
- Adapters for:
  - model providers
  - object storage
  - persistence
  - background job execution

5. Async Analysis Queue (Operational Requirement)
- Frontend/API submits analysis jobs and returns immediately with queued status.
- Worker processes analysis jobs off-thread from the web/UI process.
- Queue lifecycle states:
  - `queued` -> `in_progress` -> `succeeded`
  - `queued` -> `in_progress` -> `failed` -> `retrying` -> `succeeded|dead_letter`
- Retry policy, backoff, and max-attempt limits are required.
- Jobs must be idempotent to avoid duplicate analysis writes.
- Admin controls must support retry/requeue of failed jobs.

## High-Level ERD (Conceptual)

## Core Entities

1. `users`
- id, role, status, created_at

2. `style_influence_types`
- id, type_key, label, parameter_prefix, related_parameter_name, description, enabled_flag
- examples:
  - `profile` -> prefix `--profile`, related parameter `--stylize`
  - `sref` -> prefix `--sref`, related parameter `--sw`

3. `style_influences`
- id, style_influence_type_id, influence_code, status, pinned_flag, created_by, created_at

4. `style_influence_combinations`
- id, name, active_flag
- supports 0..n profiles + 0..n srefs assignment

5. `style_influence_combination_items`
- combination_id, style_influence_id

6. `prompts`
- id, prompt_text, status, version, curated_flag, created_by

7. `analysis_prompts`
- id, prompt_name, prompt_text, purpose (trait/recommendation/alignment), version, status, created_by, created_at

8. `images`
- id, source_type (baseline/generated/reference/upload), storage_uri, uploaded_by, created_at

9. `analysis_runs`
- id, image_id, analysis_prompt_id, run_type (trait/recommendation/alignment), queue_status, model_family (standard|niji), model_version, attempt_count, max_attempts, started_at, completed_at, last_error_code, last_error_message

10. `image_trait_analyses`
- id, image_id, analysis_run_id, trait_vector, confidence, summary, evidence

11. `recommendation_sessions`
- id, user_id, mode (precision/close-enough), prompt_id, created_at

12. `recommendations`
- id, recommendation_session_id, rank, combination_id, rationale, confidence, risk_notes, prompt_improvements

13. `post_result_feedback`
- id, recommendation_session_id, recommendation_id, generated_image_id (nullable), emoji_rating (nullable), useful_flag (nullable), comments

14. `alignment_evaluations`
- id, feedback_id, alignment_score, mismatch_summary, suggested_prompt_adjustments, alternative_combination_ids

15. `admin_actions_audit`
- id, admin_user_id, action_type, target_type, target_id, reason, created_at

## Key Relationships

1. One `recommendation_session` has many `recommendations`.
2. One `recommendation` can have many `post_result_feedback` entries.
3. One `post_result_feedback` can have one `alignment_evaluation`.
4. One `analysis_prompt` can be referenced by many `analysis_runs`.
5. One `image` can have many `analysis_runs` over time.
6. One `analysis_run` produces one `image_trait_analysis` for trait runs.
7. One `style_influence_type` has many `style_influences`.
8. One `style_influence_combination` maps to many `style_influences` via `style_influence_combination_items`.
9. One `prompt` can be referenced by many recommendation sessions.

## Vocabulary Constraints

1. `Baseline image` means:
- image with zero profiles and zero srefs applied.
- persisted as `images.source_type = baseline`.

2. Combination rule:
- Prompt can have any combination of 0..n profiles and 0..n srefs.

## Policy Rules (Initial)

1. Feedback weighting:
- emoji + evidentiary image: normal weight
- emoji only: low weight

2. Recommendation transparency:
- every recommendation must include rationale + confidence + risk notes

3. Governance:
- disabled style influences (profiles/srefs) excluded from default ranking
- audit trail required for high-impact admin actions

4. Queue processing:
- analysis is processed asynchronously and not owned by UI request threads
- failed jobs are recoverable via automatic retry and admin requeue paths

5. Prompt model selection:
- `--niji <n>` selects family `niji` version `<n>`
- `--v <n>` selects family `standard` version `<n>`
- if neither is present, persist current default `standard` model version
- prompts containing both `--v` and `--niji` are invalid

## Style-DNA Delta Analysis Extension (Agreed Direction)

Purpose:
- Add a controlled image-pair analysis workflow that isolates aesthetic influence changes between baseline and injected style controls.

Operational shape:
1. Admin selects a stored style influence (sref/moodboard) and target MidJourney model family/version.
2. System generates paste-ready test prompts from a baseline prompt suite and fixed parameter envelope.
3. Intake stores two grid images for one analysis pair:
- `baseline_grid_image_id`
- `test_grid_image_id`
4. Both runs share a parameter envelope contract:
- prompt text
- seed
- quality
- stylize tier
- raw/style mode
- influence controls (`profile`, `sref`, `sw`)
5. Worker sends both grids to vision LLM with strict JSON schema response contract.
6. Persist:
- raw structured output (audit/replay)
- normalized atomic trait strings
- canonical-mapped traits for scoring/query

Recommended entity linkage (implementation-level, naming can vary):
1. `analysis_runs`:
- add optional pair/group key for baseline-test join.
2. `images`:
- continue using source types; include explicit baseline/test pair association at run level.
3. `image_trait_analyses`:
- retain `trait_schema_version`.
- persist both:
  - `atomic_traits_raw` (open strings from LLM)
  - `trait_vector` (canonicalized/mapped payload).
4. Baseline registry entities (logical):
- `baseline_prompt_suites` (suite version + prompts)
- `baseline_render_sets` (MJ model/version + parameter envelope + prompt suite version)
- `baseline_render_set_items` (prompt -> baseline grid image reference)
5. Prompt generation entities (logical):
- `style_dna_prompt_jobs` (selected influence + target tier(s) + generated prompt text blocks)
- `style_dna_prompt_job_items` (one paste-ready prompt string per baseline prompt/tier)

Style tier interpretation policy:
1. `stylize=0` run: prioritize structural/core trait extraction.
2. `stylize=100|250|1000` runs: prioritize amplification/interaction analysis with model stylization pressure.
3. Comparisons must be interpreted within the same stylize tier only.
4. Baseline reuse is valid only when model family/version and parameter envelope match exactly.

## Open Design Questions

1. Should trait vectors be fully structured columns or JSON first?
2. Minimum metadata required before a profile/sref is discoverable?
3. Exact lifecycle states for moderation queues?
4. Should recommendation/alignment runs share `analysis_runs` or use a parallel run envelope?

## Proposed Resolutions (For Approval)

1. Trait vectors: JSON-first with stable schema versioning
- Proposal:
  - Store `trait_vector` as JSON in `image_trait_analyses`.
  - Add `trait_schema_version` field for forward compatibility.
- Why:
  - Faster iteration while taxonomy is still evolving.
  - Avoids early schema churn and migration overhead.
- Guardrail:
  - Keep a canonical trait key list in the application domain; reject unknown keys unless explicitly versioned.
- Example payload A:
```json
{
  "trait_schema_version": "v1",
  "trait_vector": {
    "dark_moody": 0.82,
    "bright_airy": 0.11,
    "graphic_novel": 0.74,
    "photographic_realism": 0.28,
    "cinematic_grade": 0.69,
    "color_saturation": 0.63,
    "minimalism": 0.35,
    "raw_grit": 0.57
  }
}
```
- Example payload B:
```json
{
  "trait_schema_version": "v1",
  "trait_vector": {
    "dark_moody": 0.24,
    "bright_airy": 0.52,
    "graphic_novel": 0.08,
    "photographic_realism": 0.88,
    "cinematic_grade": 0.31,
    "color_saturation": 0.42,
    "minimalism": 0.46,
    "raw_grit": 0.39
  }
}
```

2. Discoverability metadata: minimum required fields for `style_influences`
- Proposal:
  - Required before discoverable:
    - `style_influence_type_id`
    - `influence_code`
    - `status = active`
    - at least 1 successful trait analysis
    - confidence above minimum threshold (tunable)
  - Recommended:
    - display label
    - owner/contributor note
- Why:
  - Prevent low-signal or incomplete entries from polluting recommendations.

3. Moderation lifecycle states
- Proposal:
  - Queue/moderation states:
    - `queued`
    - `in_progress`
    - `awaiting_review` (manual mode only)
    - `approved`
    - `rejected`
    - `failed`
    - `retrying`
    - `dead_letter`
- Why:
  - Supports both current auto-approve operation and future manual-review workflows.

4. Run envelope strategy for recommendation/alignment
- Proposal:
  - Use shared `analysis_runs` table for trait/recommendation/alignment runs.
  - Keep `run_type` required and add type-specific payload tables only when needed.
- Why:
  - Keeps execution tracking consistent (status, retries, errors, model/version, prompt version).
  - Reduces duplication and simplifies operational tooling.

## Canonical Trait Taxonomy v1 (For Approval)

Trait schema version: `v1`

Scoring convention:
1. Each trait score is normalized `0.00` to `1.00`.
2. `0.00-0.24` low presence, `0.25-0.49` mild, `0.50-0.74` strong, `0.75-1.00` dominant.
3. Traits are independent signals unless noted as a paired axis.

### Group A: Medium and Rendering Read

1. `photographic_realism`
- How strongly the image reads as photographic capture rather than illustration/render.

2. `illustrative_stylization`
- Degree of illustrative/non-photographic stylization.

3. `cinematic_grade`
- Presence of cinematic color/contrast treatment and filmic finishing.

4. `graphic_novel`
- Presence of comic/graphic-novel visual language (inked edges, stylized contouring).

### Group B: Tone, Mood, and Lighting

5. `dark_moody`
- Low-key, shadow-heavy, dramatic mood.

6. `bright_airy`
- High-key, open, light-dominant mood.

7. `contrast_punch`
- Strong tonal separation and punchy light-dark dynamics.

8. `soft_tonal`
- Gentle tonal transitions and low-contrast softness.

### Group C: Color and Palette

9. `color_saturation`
- Overall intensity of chroma.

10. `warmth`
- Warm color temperature dominance.

11. `coolness`
- Cool color temperature dominance.

12. `palette_cohesion`
- Consistency and intentional harmony of color palette.

### Group D: Texture and Finish

13. `texture_microdetail`
- Fine-grained detail clarity in materials/surfaces.

14. `clean_polish`
- Refined, controlled, polished finish.

15. `raw_grit`
- Rough, imperfect, documentary-like texture/finish.

16. `noise_grain_presence`
- Visible grain/noise texture as an aesthetic/capture cue.

### Group E: Composition and Subject Treatment

17. `subject_separation`
- Clear subject/background separation.

18. `compositional_clarity`
- Readability of focal hierarchy and compositional intent.

19. `minimalism`
- Simplicity, restraint, and sparse composition.

20. `visual_complexity`
- Density and richness of visual elements/detail.

### Group F: Style Behavior and Novelty

21. `style_consistency`
- Internal consistency of style cues across the image.

22. `experimental_abstraction`
- Degree of abstract or unconventional visual interpretation.

23. `novelty_signature`
- Distinctiveness versus default/generic aesthetic output.

24. `prompt_adherence`
- How strongly the output appears aligned to prompt intent.

### Paired-Axis Guidance (Interpretive, Not Hard Constraints)

1. `dark_moody` vs `bright_airy`
2. `contrast_punch` vs `soft_tonal`
3. `clean_polish` vs `raw_grit`
4. `minimalism` vs `visual_complexity`
5. `photographic_realism` vs `illustrative_stylization`

Note:
- Pairs can both be moderate when an image mixes cues.
- Do not hard-force inverse scoring in v1.

### Governance Rules for Taxonomy Evolution

1. New/renamed trait keys require `trait_schema_version` bump.
2. Deprecated keys remain readable for at least one version window.
3. Recommendation logic must declare compatible schema versions explicitly.
4. Admin tools must show schema version on analysis/recommendation records.

## Definition of Done for This Document

This document is considered approved when:

1. Entity set covers all confirmed U1/U2/U3 flows.
2. Relationship model supports recommendation + feedback loop + governance.
3. Principles section is accepted as implementation contract.
4. Open questions are either resolved or explicitly deferred.
