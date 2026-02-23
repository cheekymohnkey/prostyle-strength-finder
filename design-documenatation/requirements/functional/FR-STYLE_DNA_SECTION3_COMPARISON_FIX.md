# FR - Style-DNA Section 3 Comparison UX Fix

Status: Draft (Implementation Started)  
Date: 2026-02-23

## Purpose

Define requirements to make Section 3 ("Style Adjustment Comparison") behave like Section 2 in coverage visibility and operator workflow, while preserving existing backend run/worker contracts.

Primary operator intent:
1. Admin configures and uploads comparison images to maximize accuracy/likelihood of extracted DNA traits for moodboards (`--profile`) and style references (`--sref`).
2. Section 3 is used for strict, repeatable prompt-aligned comparisons using stylize/style-weight matrices that are determined by separate analysis work.

## In Scope

1. Section 3 prompt coverage and selection UX.
2. Section 3 copy/upload/analyze state tracking per prompt.
3. Section 3 baseline/test visual comparison context.
4. Section 3 run submission and results visibility.

## Out of Scope

1. MidJourney render automation.
2. Taxonomy redesign.
3. Non-admin Style-DNA exposure.

## Functional Requirements

1. `FR-SD3-001` Section 3 shall show prompt rows derived from the loaded baseline set prompt definitions for the active stylize tier.
2. `FR-SD3-002` Section 3 shall provide prompt selection controls equivalent in intent to Section 2 (operator can pick any prompt key from the loaded set).
3. `FR-SD3-003` Section 3 shall show two prompt-state lists:
- prompts not yet copied/uploaded
- prompts completed for current section workflow
4. `FR-SD3-004` Prompt state shall update when "Copy to Clipboard" is clicked for that prompt.
5. `FR-SD3-005` Prompt state shall update when a test image is uploaded and linked to that prompt.
6. `FR-SD3-006` Section 3 shall display baseline image context and test image context together for the selected prompt:
- baseline image thumbnail from baseline set item (`promptKey + stylizeTier`)
- uploaded test image thumbnail and id
7. `FR-SD3-007` "Analyse DNA" action shall be available only when prerequisites are met:
- baseline set loaded
- valid prompt selected from loaded set
- matching baseline image exists
- test image uploaded/selected for that prompt
- style adjustment fields valid (`type`, `midjourney id`, `style influence id`)
8. `FR-SD3-008` Clicking "Analyse DNA" shall submit the comparison run using the selected prompt and linked test image.
9. `FR-SD3-009` Section 3 shall surface run lifecycle status (`queued`, `in_progress`, `succeeded`, `failed`, `dead_letter`) for the submitted run.
10. `FR-SD3-010` On successful completion, Section 3 shall render returned traits/results in-page for the selected prompt run.
11. `FR-SD3-011` Result payload shall be persisted through existing Style-DNA result storage path (raw + trait artifacts).
12. `FR-SD3-012` Section 3 shall support matrix-driven execution for each style adjustment type and make required matrix cells explicit to operators.
13. `FR-SD3-013` Section 3 shall support admin creation of a new Style Influence record directly from the Style Adjustment Midjourney ID input flow.
14. `FR-SD3-014` Section 3 shall provide a `Create New` action that:
- validates the entered Midjourney ID and adjustment type
- creates a new active style influence record
- auto-selects the newly created style influence in the Style Influence selector
15. `FR-SD3-015` Newly created style influences shall be immediately visible in the Section 3 Style Influence list without requiring manual DB edits or external workflow steps.

## Matrix Requirements

1. `FR-SD3-MX-001` For moodboard/profile comparisons (`styleAdjustmentType=profile`), required stylize tiers are:
- `--s 0`
- `--s 100`
- `--s 1000`

2. `FR-SD3-MX-002` For style-reference/sref comparisons (`styleAdjustmentType=sref`), required stylize/style-weight combinations are:
- `--s 0 --sw 0`
- `--s 0 --sw 1000`
- `--s 1000 --sw 1000`
- `--s 100 --sw 250`

3. `FR-SD3-MX-003` Prompt coverage in Section 3 shall be tracked per prompt key and per required matrix cell for the selected adjustment type.
4. `FR-SD3-MX-004` A matrix cell shall be marked complete only when:
- prompt copy action has been performed for that cell
- corresponding test image has been uploaded for that cell
- run has completed and returned persisted traits
5. `FR-SD3-MX-005` Section 3 shall visually separate incomplete vs complete matrix cells for operator progress control.
6. `FR-SD3-MX-006` Matrix coverage shall be treated as progressive confidence, not a hard execution gate.
7. `FR-SD3-MX-007` Section 3 shall allow analysis and trait retrieval with partial matrix completion.
8. `FR-SD3-MX-008` Section 3 shall surface a clear confidence/coverage indicator showing completed cells vs target cells.

## UX/State Requirements

1. `FR-SD3-UX-001` Prompt rows should visually indicate state; completed rows should shift to success styling (green).
2. `FR-SD3-UX-002` Copy-complete and upload-complete shall both be reflected in row status (not only upload state).
3. `FR-SD3-UX-003` Guardrail reasons shall remain explicit and actionable when Analyse DNA is disabled.
4. `FR-SD3-UX-004` Section 3 should keep operator context local: selected prompt, linked baseline image, linked test image, and latest run id/status visible without navigating away.

## Acceptance Criteria

1. Admin can select any prompt from the loaded set in Section 3 and see its baseline/test context.
2. Copying a prompt line updates that prompt row state immediately.
3. Uploading a test image for a prompt updates row state and enables analysis when other guardrails pass.
4. "Analyse DNA" submits exactly one run for the selected prompt/image combination per idempotency key.
5. On worker success, traits are shown in Section 3 and are retrievable via run lookup.
6. Section 3 can be used to work through the full prompt set without losing per-prompt progress visibility.
7. For `profile`, all required stylize tiers (`0`, `100`, `1000`) are available and tracked for each prompt.
8. For `sref`, all required stylize/style-weight matrix cells (`0/0`, `0/1000`, `1000/1000`, `100/250`) are available and tracked for each prompt.
9. Completion reporting makes missing prompts/cells unambiguous and indicates that additional completed cells increase confidence.
10. Admin can run and store results with partial matrix coverage, while seeing the remaining recommended cells.
11. Admin can create a new Midjourney style adjustment ID directly in Section 3 and use it immediately in prompt generation/run submission.

## Decisions Captured

1. Section 3 matrix coverage increases confidence but is not required to produce usable results.
2. `profile` and `sref` test families are explicit operator choices in the UI.
3. Section 3 progress is tracked at matrix-cell granularity (`promptKey + test cell`), not only prompt-level.
4. Prompt output must include the chosen test-family matrix combinations so admins can run consistent external render tests.

## API/Contract Notes

1. Existing run submission endpoint (`POST /v1/admin/style-dna/runs`) remains the execution contract.
2. Existing run lookup endpoint (`GET /v1/admin/style-dna/runs/:styleDnaRunId`) remains the result retrieval contract.
3. Existing result persistence contract remains authoritative (worker writes style-dna run result artifacts).
4. Current run contract does not carry per-run `styleWeight` as an explicit field; UI matrix output includes `--sw` in generated prompts, but backend trusts uploaded-image intent.
5. Admin-side style influence creation from Section 3 is exposed via admin create/list style influence contracts and used directly by the UI.

## Implementation Status (Current)

Implemented in UI (`apps/frontend/app/admin/style-dna/page.tsx`):
1. Section 3 test-family selector with:
- `profile_triplet` (`--s 0`, `--s 100`, `--s 1000`)
- `sref_matrix` (`--s 0 --sw 0`, `--s 0 --sw 1000`, `--s 1000 --sw 1000`, `--s 100 --sw 250`)
2. Matrix prompt generation and preview blocks for each prompt + cell.
3. Per-cell progress tracking for copy/upload/run/result state.
4. Pending/completed lists now include cell-level identity.
5. Selected context panel includes selected prompt + selected matrix cell + baseline/test references.
6. Analyse DNA action remains integrated with existing submit/lookup APIs.

Not yet fully enforced server-side:
1. Per-run `--sw` is not validated as a first-class run field in API payload/DB schema.
2. Cell-level run identity is UI-managed; backend currently keys runs by submitted prompt/tier/image/idempotency.
3. Section 3 now supports direct creation of new style influences from Midjourney IDs and refreshes selector options after create.
