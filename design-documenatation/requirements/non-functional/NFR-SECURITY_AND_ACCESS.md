# NFR - Security and Access

Status: Draft  
Date: 2026-02-23

## Requirements

1. `NFR-SA-001` API auth shall rely on JWT validation and user-role enforcement.
2. `NFR-SA-002` Admin endpoints shall enforce explicit admin-role checks.
3. `NFR-SA-003` Contributor endpoints shall reject inactive users and unauthorized roles.
4. `NFR-SA-004` Role-sensitive actions shall be auditable with actor, action, target, timestamp.
5. `NFR-SA-005` Input validation failures shall return structured API errors with stable codes.

## Verification

1. Admin and frontend-proxy smokes include role-boundary assertions.
2. Unauthorized requests return `401` or `403` with stable error payloads.
