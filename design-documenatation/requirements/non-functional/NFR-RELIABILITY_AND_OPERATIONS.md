# NFR - Reliability and Operations

Status: Draft  
Date: 2026-02-23

## Requirements

1. `NFR-RO-001` Long-running analysis shall run asynchronously via queue + worker.
2. `NFR-RO-002` Queue processing shall support bounded retries and dead-letter behavior.
3. `NFR-RO-003` Run submission shall be idempotent.
4. `NFR-RO-004` Structured lifecycle logs shall include correlation identifiers.
5. `NFR-RO-005` Backup/restore runbooks and smoke gates shall be maintained for launch readiness.
6. `NFR-RO-006` Smoke scripts shall validate critical happy/negative paths for admin and Style-DNA workflows.

## Verification

1. `style-dna:*` smokes and launch readiness smoke are present.
2. Worker code updates run status through queue lifecycle states.
