# Worker App

Responsibility:
- Consume analysis jobs from the queue.
- Execute async processing and update run lifecycle state.
- Emit structured operational logs for job processing.

Not owned here:
- User-facing HTTP request handling.
