# Prostyle Strength Finder - LLM Workflow

Status: Agreed  
Date: 2026-02-18  
Purpose: Keep LLM behavior stable and predictable as context windows fill over time.

## NEXT SESSION START HERE (as of 2026-02-28)

Current next implementation task:
1. `SDNA-04` Prompt Generation Service + Endpoints.

Primary pointers:
1. `design-documenatation/STYLE_DNA_HANDOVER_2026-02-28.md`
2. `design-documenatation/implementation/STYLE_DNA_ADMIN_IMPLEMENTATION_TASKS.md`

Copy/paste kickoff prompt for a fresh chat:

```text
Use these docs as source of truth:
- design-documenatation/DECISIONS.md
- design-documenatation/USER_NEEDS_ANALYSIS.md
- design-documenatation/ARCHITECTURE_AND_ERD.md
- design-documenatation/TECHNICAL_DECISIONS.md
- design-documenatation/requirements/REQUIREMENTS_INDEX.md
- design-documenatation/requirements/PRODUCT_REQUIREMENTS_HIGH_LEVEL.md
- design-documenatation/STYLE_DNA_HANDOVER_2026-02-28.md
- design-documenatation/implementation/STYLE_DNA_ADMIN_IMPLEMENTATION_TASKS.md

Task objective:
Implement SDNA-04 Prompt Generation Service + Endpoints.

Scope:
1) Finalize prompt-job create/get endpoints with admin RBAC + immutable audit.
2) Ensure deterministic prompt generation output and ordering.
3) Enforce eligibility checks (influence readiness + baseline coverage/context checks).
4) Preserve/verify idempotency behavior and explicit validation errors.

Out of scope:
1) Worker execution path changes.
2) Frontend redesign.
3) Non-Style-DNA surfaces.

Definition of done:
1) SDNA-04 endpoint/service acceptance criteria are implemented.
2) Relevant smokes/checks are listed and passing (or explicitly marked not run with reason).
3) Task end includes handoff summary with files changed + risks + next task.
```

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
05. `design-documenatation/requirements/REQUIREMENTS_INDEX.md`
06. `design-documenatation/requirements/PRODUCT_REQUIREMENTS_HIGH_LEVEL.md`
07. `design-documenatation/STYLE_DNA_HANDOVER_2026-02-28.md`

## Implementation Plan Links

Current frontend runtime contract:
1. UI is Next.js App Router in `apps/frontend/app/*` (legacy frontend fallback has been retired).

1. Master implementation plan:
- `design-documenatation/implementation/IMPLEMENTATION_PLAN.md`
2. UI upgrade implementation plan:
- `design-documenatation/implementation/UI_UPGRADE_IMPLEMENTATION_PLAN.md`
3. Style-DNA admin implementation plan:
- `design-documenatation/implementation/STYLE_DNA_ADMIN_IMPLEMENTATION_PLAN.md`
4. Style-DNA admin implementation tasks:
- `design-documenatation/implementation/STYLE_DNA_ADMIN_IMPLEMENTATION_TASKS.md`
5. UI upgrade handover (latest):
- `design-documenatation/UI_UPGRADE_HANDOVER_2026-02-23.md`
6. Style-DNA handover (latest):
- `design-documenatation/STYLE_DNA_HANDOVER_2026-02-28.md`


## New Task Start Template

Copy/paste this at the start of a new chat:

```text
Use these docs as source of truth:
- design-documenatation/DECISIONS.md
- design-documenatation/USER_NEEDS_ANALYSIS.md
- design-documenatation/ARCHITECTURE_AND_ERD.md
- design-documenatation/TECHNICAL_DECISIONS.md
- design-documenatation/requirements/REQUIREMENTS_INDEX.md
- design-documenatation/requirements/PRODUCT_REQUIREMENTS_HIGH_LEVEL.md
- design-documenatation/STYLE_DNA_HANDOVER_2026-02-28.md

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
1. `design-documenatation/implementation/STYLE_DNA_ADMIN_IMPLEMENTATION_PLAN.md`
2. `design-documenatation/implementation/STYLE_DNA_ADMIN_IMPLEMENTATION_TASKS.md`
3. `design-documenatation/TRAIT_TAXONOMY_SCHEMA_DRAFT.json`
4. `design-documenatation/TRAIT_TAXONOMY_SQL_DRAFT.sql`
