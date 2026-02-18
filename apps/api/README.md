# API App

Responsibility:
- Serve versioned REST endpoints (`/v1/...`).
- Validate auth and request contracts.
- Enqueue async analysis work for worker processing.

Not owned here:
- Long-running analysis execution.
