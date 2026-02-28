# Prostyle Strength Finder - Epic F: Style DNA UX Redesign

Status: Closed (Implemented + Polish Complete)  
Date: 2026-03-01  
Depends on:
- `design-documenatation/implementation/STYLE_DNA_UX_REDESIGN_PROPOSAL.md` (Source of Truth)
- `design-documenatation/STYLE_DNA_HANDOVER_2026-02-28.md`
- `design-documenatation/implementation/STYLE_DNA_ADMIN_IMPLEMENTATION_PLAN.md`

## Purpose

Transform the Style DNA management interface from a disjointed, form-based "database mirror" into a workflow-centric "Studio Console". This Epic implements the design proposal to reduce friction, eliminate manual context switching, and streamline the baseline-to-analysis workflow.

## Epic Objective

Replace the 3-section vertical layout with a Master-Detail Console layout featuring a Global Context Bar, Prompt Playlist navigation, and a drag-and-drop Comparison Studio.

## Scope

1.  **Global Context Management:** Lift state (Model, Stylize Tier, Baseline Set) to page-level or a specialized store.
2.  **New Layout Structure:** Implement the "Studio Console" layout (Top Bar, Left Sidebar, Main Comparison Area).
3.  **Prompt Playlist:** Sidebar navigation with visual status indicators per prompt.
4.  **Comparison Studio:** Two-column drag-and-drop interface for Baseline vs. Test grids.
5.  **Smart Interactions:**
    *   Drag-and-drop image uploads with auto-attach/submit.
    *   Clipboard paste support for images (click-to-paste).
    *   "Copy Job Prompt" button (generates full CLI command).
    *   Quick-create modal for new Style Influences.
6.  **Refactoring:** Replace the existing `admin/style-dna/page.tsx` logic with the new component structure.

## Out of Scope

- Changes to the underlying data model or API endpoints (UX layer only, using existing APIs).
- Changes to the analysis worker logic.
- Consumer-facing pages.

## Implementation Tasks

### F1: State Management & Studio Layout Skeleton
**Objective:** Establish the new layout structure and centralize the "Global Context" state.
- [x] Create `StyleStudioStore` (or `useStyleStudioState` hook) to manage:
    - User selection: `activeModel`, `activeStylizeTier`, `activePromptKey`, `activeStyleInfluenceId`.
    - Derived data: `activeBaselineSetId` (found from model/stylize), `activePromptDefinition`.
- [x] Implement `StudioLayout` component structure:
    - `GlobalToolbar` (Top): Selectors for Model Family and Stylize Tier. Show "Baseline Set Status".
    - `MainContainer`: Flex/Grid layout for Sidebar + content.
- [x] Refactor `admin/style-dna/page.tsx` to use this new skeleton (temporarily rendering placeholders for inner sections).
- [x] verification: Page loads with new header. Changing "Stylize Tier" updates the global state.

### F2: Prompt Playlist & Navigation
**Objective:** Implement the sidebar navigation that drives the workflow.
- [x] Create `PromptPlaylist` component:
    - List all prompts from the standard suite.
    - Highlight the `activePromptKey`.
- [x] Integrate status indicators per prompt (requires querying baseline coverage and run status for the active Style Influence).
    - 🔴 No Baseline
    - 🟡 Ready to Run (Baseline present, Test missing)
    - 🟢 Analyzed (Run complete)
- [x] Verification: Clicking a prompt in the list updates the `activePromptKey` in the global store. Status dots reflect mock/real state.

### F3: Smart Drop Zones & Comparison Studio
**Objective:** Implement the core two-column workspace with friction-free file handling.
- [x] Create `SmartDropZone` component:
    - Props: `label`, `isEmpty`, `onFileSelect`, `onPaste`, `isUploading`.
    - Visuals: Large target area when empty, thumbnail preview when filled.
    - Interaction: Handle drag-enter/leave/drop.
    - Clipboard: Handle click-to-focus + paste event (or dedicated "Paste" button).
- [x] Implement `ComparisonStudio` component (The Main View):
    - **Left Column (Baseline):**
        - Connects to `SmartDropZone`.
        - Logic: On drop, `uploadBaselineImage` -> `attachBaselineItem` automatically.
        - Displays loaded baseline grid if it exists for `activePromptKey` + `activeStylizeTier`.
    - **Right Column (Test):**
        - Connects to `SmartDropZone`.
        - Logic: On drop, `uploadTestImage` -> `createStyleDnaRun` (or queue for submit) automatically.
        - Displays test grid if run exists.
- [x] Verification: Can drag-drop images into both slots. Console logs successful upload/attach chains.

### F4: Style Influence Controls & Prompt Copy
**Objective:** Complete the "Target" column workflow.
- [x] Implement `StyleInfluenceSelector` in the Right Column header.
    - Dropdown to switch `activeStyleInfluenceId`.
    - "New Influence" button triggering a simple modal/popover (Midjourney ID + Type).
- [x] Implement `CopyPromptButton`:
    - Logic: Construct the CLI prompt string: `/imagine prompt: <prompt_text> --sref <code_or_url> --sw <stylize_tier> ...` based on active context.
    - Behavior: Copies to clipboard, shows ephemeral "Copied!" toast.
- [x] Verification: "Copy Prompt" puts valid CLI command in clipboard. Creating a new influence immediately selects it.

### F5: Integration & Smoke Verification
**Objective:** Polish the assembly and verify the full workflow against real APIs.
- [x] Connect all components in `page.tsx`.
- [x] Ensure "Smart Drop" actions correctly invalidate/refetch React Query data (so list statuses update instantly).
- [x] Add error handling (toasts/alerts) for upload failures.
- [x] Run manual acceptance test:
    1. Select v6/Stylize 100.
    2. Select Prompt 1.
    3. Drop Baseline -> Auto-saves.
    4. Select Style Influence.
    5. Copy Prompt.
    6. Drop Test Grid -> Run launches.
    7. Verify status updates in Playlist.
- [x] Create/Update smoke test script if possible (UI interactions are hard to script in CLI, so focus on manual verification plan or unit tests for the store logic).

## Completed UX Polish Backlog (Post-Epic)

All post-epic Studio polish items are now complete:

1. Standardized spacing/visual rhythm across Studio cards for baseline/test/run-operation panel alignment at common desktop widths.
2. Normalized warning/blocked-state panel copy to a single actionable prerequisite sentence pattern.
3. Tightened run-detail modal readability for long error payloads (line-wrap + truncation consistency).
4. Validated and fixed keyboard focus order and focus-return behavior across Prompt Playlist, New Influence modal, and run-detail modal.
5. Expanded Playwright run-ops edge coverage for retry disable-reason visibility and filter/limit/paging boundary interactions.

Verification snapshot:
1. `npm run contracts` (pass).
2. `set -a && source .env.local && set +a && npm run admin:frontend-proxy-smoke` (pass).
3. Targeted Playwright run-ops suite: `npx playwright test tests/playwright/style-dna-run-ops-retry-disable.spec.ts tests/playwright/style-dna-run-ops-filter-paging.spec.ts` (pass).

## Definition of Done

- All legacy 3-section UI code is removed/replaced.
- The user can complete a full analysis loop (Select -> Baseline -> Test -> Run) without leaving the Studio view.
- Global context (Model/Stylize) persists across prompt navigation.
- "Copy Prompt" generates correct CLI strings.
- Implementation matches `STYLE_DNA_UX_REDESIGN_PROPOSAL.md`.
