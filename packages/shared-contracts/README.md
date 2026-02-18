# Shared Contracts Package

Responsibility:
- Hold shared request/response contracts used across apps.
- Define queue message envelopes and status/result payload shapes.
- Version contract schemas to support safe evolution.

Consumers:
- `apps/api`
- `apps/worker`
- `apps/frontend`
