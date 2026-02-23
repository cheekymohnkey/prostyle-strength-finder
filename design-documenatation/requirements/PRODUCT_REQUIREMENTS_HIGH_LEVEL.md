# Prostyle Strength Finder - Product Requirements (High-Level)

Status: Draft  
Date: 2026-02-23

## Product Objective

Deliver a role-aware recommendation and analysis system for MidJourney workflows that improves decision quality while keeping rendering external to the product.

## User Roles

1. `U1` Admin: full recommendation usage plus governance, moderation, and diagnostics.
2. `U2` Contributor: expand style influence inventory and trigger analysis.
3. `U3` Consumer: request and compare recommendations with rationale/confidence.

## Functional Requirement Families

1. Recommendation and ranking flow.
2. Post-result feedback and alignment loop.
3. Admin governance and moderation.
4. Contributor submission and retry workflows.
5. Admin Style-DNA baseline-vs-test workflow.

## Non-Functional Requirement Families

1. Security and role-based access control.
2. Reliability, queue recoverability, and auditability.
3. Performance, determinism, and testability.
4. Environment and deployment consistency.

## Hard Product Constraints

1. No in-app MidJourney render execution.
2. Recommendation and analysis outputs only.
3. Async processing for non-trivial analysis tasks.
4. Versioned, auditable decision and run records.
