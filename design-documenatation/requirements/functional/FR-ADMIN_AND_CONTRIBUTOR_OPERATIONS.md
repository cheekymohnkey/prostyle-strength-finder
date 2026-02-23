# FR - Admin and Contributor Operations

Status: Draft  
Date: 2026-02-23

## Scope

Covers moderation, governance, prompt curation, approval policy, contributor onboarding/triggering, and audit behavior.

## Requirements

1. `FR-AO-001` Admin operations endpoints shall require admin role.
2. `FR-AO-002` Contributor submission endpoints shall require contributor or admin role.
3. `FR-AO-003` Admin shall be able to disable/pin/unpin style influences.
4. `FR-AO-004` Admin shall be able to moderate analyses (flag/remove/re-run).
5. `FR-AO-005` Admin shall be able to manage prompt curation states (`active`, `deprecated`, `experimental`).
6. `FR-AO-006` Admin shall be able to set approval policy (`auto-approve`, `manual`).
7. `FR-AO-007` High-impact admin actions shall emit immutable audit records.
8. `FR-AO-008` Governance updates shall invalidate recommendation ranking caches.

## User Acceptance Criteria

1. Non-admin attempts on admin endpoints receive `403 FORBIDDEN`.
2. Contributor workflows are executable without admin-only controls.
3. Governance changes are reflected in downstream recommendation behavior.
