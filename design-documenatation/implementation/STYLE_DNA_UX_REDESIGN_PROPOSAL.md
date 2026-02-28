# Style DNA Management - UX Redesign Proposal

Status: Implemented
Date: 2026-02-27
Target: `apps/frontend/app/admin/style-dna/page.tsx`

## Executive Summary

The current Style DNA management interface suffers from "database-mirroring" UI design. It exposes the underlying relational model (Baseline Set -> Baseline Grid -> Test Grid -> Run) as three disconnected vertical linear forms. This forces the human operator to manually bridge the context gap between these sections.

The goal of this redesign is to shift from a **Data-Entry Model** to a **Workflow-Centric Model**.

## Current Usability Audit (The "Pain Points")

### 1. Context Fragmentation
- **Issue:** The screen is split into three vertical silos (Setup, Baseline, Test).
- **Impact:** Users must scroll up to Section 1 to remember what "Stylize Tier" or "Model" is active while working in Section 3.
- **Friction:** Changing the "Stylize Tier" in Section 1 does not automatically filter or reset relevant views in Section 3, leading to accidental mismatches.

### 2. The "Copy/Paste" Tax
- **Issue:** The workflow relies heavily on "Paste ID" or "Select ID from dropdown".
- **Impact:** Users constantly switch context between the UI and their clipboard.
- **Friction:** Uploading an image requires: `Select File` -> `Upload` -> `Wait` -> `Copy ID` -> `Paste ID into Form` -> `Attach`. This should be a single "Drag & Drop to Slot" action.

### 3. Redundant Configuration
- **Issue:** Section 3 (Testing) asks for "Test Family" and "Test Cell" repeatedly.
- **Impact:** High cognitive load to ensure the test settings match the baseline settings established two panels up.
- **Friction:** If I am working on "Stylize 100", I shouldn't have to manually select "Stylize 100" in the test panel; it should be implied by my active workspace context.

### 4. Visibility vs. Verticality
- **Issue:** To see if a prompt has a baseline, you list them in Section 2. To see if it has a result, you check Section 3.
- **Impact:** There is no "Master View" of a Style Influence's completeness.
- **Friction:** Users cannot glance at a Style Influence and see "5/10 prompts analyzed".

## Proposed Solution: The "Studio Console" Layout

We will move away from the "3 Vertical Sections" to a **Master-Detail Console** layout.

### Core Concept: "The Active Context Bar"
Instead of Section 1 being a form, it becomes a distinct **Global Toolbar** at the top.
- **Selectors:** Model Family (v6), Stylize Tier (100), Baseline Set (Loaded automatically based on above).
- **State:** "Ready to Analyze" or "Baseline Missing".
- **Impact:** This locks the global context. Everything below respects these settings. No more mismatched dropdowns.

### Layout: Two-Column "Comparison Studio"

**Left Column: The Source (Baseline)**
- Automatically loads the *Baseline Grid* for the currently selected Prompt + Global Settings.
- Persistence: Once a baseline is uploaded for a Prompt/Stylize tier, it persists globally for all future comparisons. Users never re-upload baselines for the same context.
- Start State: "No Baseline" (Big drop zone).
- Loaded State: High-res thumbnail of the existing baseline.
- **Smart Input:** "Click to Paste from Clipboard" or Drag & Drop.

**Right Column: The Target (Style Influence)**
- **Header Control:** 
  - "Active Style Influence" Selector (Searchable Dropdown).
  - "New Influence" Button: Quick-create modal for `Midjourney ID` + `sref/profile` type.
- **Action:** 
  - **"Copy Prompt" Button:** Generates and copies the full CLI command (prompt + parameters + sref/profile codes) to clipboard for external rendering.
- Body: Displays the *Test Grid* for the currently selected Prompt.
- State:
  - If missing: Big "Drop Test Grid Here" zone.
  - If present: Thumbnail + "Run Analysis" button.
- **Smart Input:** "Click to Paste from Clipboard" or Drag & Drop.

### Navigation: The "Prompt Playlist"
A sidebar or persistent list offering a playlist of the Standard Prompt Suite.
- **Visuals:** Status indicators per prompt (🔴 Missing Baseline, 🟡 Ready to Run, 🟢 analyzed).
- **Action:** Clicking a prompt in the list updates the "Comparison Studio" (Left/Right columns) instantly.
- **Impact:** Users work through the playlist one by one, dragging images into the Left (Baseline) or Right (Test) zones as needed.

## Workflow Walkthrough (New)

1. **Setup:** Admin sets Global Bar to `v6.0` + `Stylize 100`.
2. **Selection:** Admin clicks "Prompt 1: Portrait" in the playlist.
3. **Baseline Check:**
   - Left Panel shows "No Baseline".
   - Admin pastes/drops baseline grid. System auto-saves.
4. **Test Run:**
   - Right Panel has "Neon sref" selected. Shows "No Test Grid".
   - Admin pastes/drops test grid. System auto-saves.
5. **Execution:**
   - "Run Analysis" button lights up. Admin clicks it.
   - Status changes to "Queued".
6. **Next:** Admin clicks "Prompt 2" in playlist.

## Technical Requirementswith:
   - Drag & Drop support.
   - "Click container to Paste" support (reads clipboard image data directly).
   - Async state handling (upload -> get ID -> attach/link)

1. **State Management:** Lift state up. `activePrompt`, `activeGlobalContext` (model/stylize) need to be page-level state.
2. **Smart Uploaders:** Create a `SmartDropZone` component that handles the `upload -> get ID -> attach/link` chain in one async operation.
3. **Derived State:** Ditch the manual "Select Test Cell" dropdowns. If Global Context is `Stylize 100`, the Test Cell is automatically `sref + sw100` (or user mapped).

## Migration Steps

1. **Refactor Page State:** centralized `useStyleStudioStore` or similar.
2. **Build `PromptPlaylist` Component:** The navigation anchor.
3. **Build `SmartDropZone` Component:** The friction reducer.
4. **Assemble "Studio" Layout:** Replace the 3 sections with the new 2-column view.

