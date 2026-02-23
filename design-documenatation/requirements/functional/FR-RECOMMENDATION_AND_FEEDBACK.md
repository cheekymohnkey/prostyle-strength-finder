# FR - Recommendation and Feedback

Status: Draft  
Date: 2026-02-23

## Scope

Covers core user flows shared across U1/U2/U3 for recommendation, confidence handling, and post-result feedback.

## Requirements

1. `FR-RF-001` The system shall accept recommendation submissions from authenticated users and return ranked style influence recommendations.
2. `FR-RF-002` The system shall support `precision` and `close enough` recommendation modes.
3. `FR-RF-003` The system shall apply confidence gates: `precision >= 0.65`, `close enough >= 0.45`.
4. `FR-RF-004` The system shall include rationale and risk notes for each recommendation.
5. `FR-RF-005` The system shall support post-result feedback with generated image and/or emoji sentiment.
6. `FR-RF-006` The system shall support alignment evaluation and suggested prompt adjustments.
7. `FR-RF-007` The system shall persist recommendation and feedback entities for audit and analysis.

## User Acceptance Criteria

1. A user can complete prompt-to-recommendation in one session.
2. Low-confidence results are visibly labeled and not silently treated as high-confidence.
3. Post-result feedback can be submitted and retrieved with session linkage.
