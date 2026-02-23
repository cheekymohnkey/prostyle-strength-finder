# NFR - Performance and Quality

Status: Draft  
Date: 2026-02-23

## Requirements

1. `NFR-PQ-001` API endpoints shall fail fast on invalid requests with explicit reasons.
2. `NFR-PQ-002` Recommendation and governance caches shall support invalidation on write paths.
3. `NFR-PQ-003` Deterministic local inference mode shall be available for predictable offline verification.
4. `NFR-PQ-004` Strict JSON schema contracts shall be used for Style-DNA LLM responses in llm mode.
5. `NFR-PQ-005` Contract and smoke checks shall be runnable as part of readiness flows.

## Verification

1. API validators reject malformed payloads.
2. Style-DNA adapter requests `response_format.type=json_schema` and `strict=true`.
3. Launch smoke references full Style-DNA smoke suite.
