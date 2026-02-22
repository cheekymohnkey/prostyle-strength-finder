# Prostyle Strength Finder - LLM Workflow

Status: Agreed  
Date: 2026-02-18  
Purpose: Keep LLM behavior stable and predictable as context windows fill over time.

## Core Rules

1. Docs are memory, chat is execution.
2. Start a fresh chat per new implementation task.
3. Reference source-of-truth docs by path instead of re-explaining history.
4. Keep each task objective narrow and testable.
5. End each task with a handoff summary.

## Source-of-Truth Docs

Always anchor tasks to:

01. `design-documenatation/DECISIONS.md`
02. `design-documenatation/USER_NEEDS_ANALYSIS.md`
03. `design-documenatation/ARCHITECTURE_AND_ERD.md`
04. `design-documenatation/TECHNICAL_DECISIONS.md`
05. `design-documenatation/MVP_PATH.md`
06. `design-documenatation/IMPLEMENTATION_PLAN.md`
07. `design-documenatation/EPIC_A_IMPLEMENTATION_TASKS.md`
08. `design-documenatation/EPIC_B_IMPLEMENTATION_TASKS.md`
09. `design-documenatation/EPIC_C_IMPLEMENTATION_TASKS.md`
10. `design-documenatation/EPIC_D_IMPLEMENTATION_TASKS.md`
11. `design-documenatation/EPIC_E_IMPLEMENTATION_TASKS.md`

## Implementation Plan Links

1. Master implementation plan:
- `design-documenatation/IMPLEMENTATION_PLAN.md`
2. UI upgrade implementation plan:
- `design-documenatation/UI_UPGRADE_IMPLEMENTATION_PLAN.md`
3. Style-DNA admin implementation plan:
- `design-documenatation/STYLE_DNA_ADMIN_IMPLEMENTATION_PLAN.md`
4. Style-DNA admin implementation tasks:
- `design-documenatation/STYLE_DNA_ADMIN_IMPLEMENTATION_TASKS.md`
5. UI upgrade handover (latest):
- `design-documenatation/UI_UPGRADE_HANDOVER_2026-02-21.md`
6. Style-DNA handover (latest):
- `design-documenatation/STYLE_DNA_HANDOVER_2026-02-22.md`


## New Task Start Template

Copy/paste this at the start of a new chat:

```text
Use these docs as source of truth:
- design-documenatation/DECISIONS.md
- design-documenatation/USER_NEEDS_ANALYSIS.md
- design-documenatation/ARCHITECTURE_AND_ERD.md
- design-documenatation/TECHNICAL_DECISIONS.md
- design-documenatation/MVP_PATH.md
- design-documenatation/IMPLEMENTATION_PLAN.md
- design-documenatation/EPIC_A_IMPLEMENTATION_TASKS.md
- design-documenatation/EPIC_B_IMPLEMENTATION_TASKS.md
- design-documenatation/EPIC_C_IMPLEMENTATION_TASKS.md
- design-documenatation/EPIC_D_IMPLEMENTATION_TASKS.md
- design-documenatation/EPIC_E_IMPLEMENTATION_TASKS.md

Task objective:
<one concrete objective>

Scope:
<what is in scope>

Out of scope:
<what is explicitly not included>

Constraints:
<technical or product constraints>

Definition of done:
<acceptance criteria>
```

## Mid-Task Control Pattern

If the model starts drifting:

1. Restate objective in one sentence.
2. Restate out-of-scope items.
3. Ask for current plan + changed files.
4. Request “finish current step only”.

## Completion Handoff Template

At task end, request:

```text
Provide:
1) What was completed
2) Files changed
3) Decisions made (if any)
4) Outstanding risks/issues
5) Recommended next task
```

## Context Window Hygiene

1. Avoid long back-and-forth brainstorming in active coding chat.
2. Move settled decisions into docs immediately.
3. For long tasks, ask for checkpoint summaries every major step.
4. If context >70%, finish current slice and start a new chat with the task template.

## Guardrails for Stable Behavior

1. Ask for implementation only after objective + DoD are explicit.
2. Require file references in every summary.
3. Require tests/checks to be listed (or explicitly marked not run).
4. Keep “one task, one chat” unless the task is tiny.

## Suggested Task Unit Size

Good unit:
- one endpoint
- one worker flow
- one UI page slice
- one migration + repository method set

Avoid in one task:
- full epic implementation
- large cross-cutting refactors + new features mixed together

## Escalation Triggers

Pause and re-scope when:

1. More than 5 files change unexpectedly.
2. New architecture decisions are needed.
3. Requirements conflict with source-of-truth docs.
4. The model starts proposing unrequested scope expansion.

## Definition of Workflow Success

1. Predictable task execution with low drift.
2. Minimal context-window degradation effects.
3. Clean handoffs between chats with no decision loss.

## Feature-Specific Contracts

Keep feature implementation contracts out of this workflow doc.

Style-DNA extraction and taxonomy policy references:
1. `design-documenatation/STYLE_DNA_ADMIN_IMPLEMENTATION_PLAN.md`
2. `design-documenatation/STYLE_DNA_ADMIN_IMPLEMENTATION_TASKS.md`
3. `design-documenatation/TRAIT_TAXONOMY_SCHEMA_DRAFT.json`
4. `design-documenatation/TRAIT_TAXONOMY_SQL_DRAFT.sql`
