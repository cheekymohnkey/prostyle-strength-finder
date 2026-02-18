# S3 Bucket and Key Conventions

## Environment Isolation

Use separate buckets per environment:
- `prostyle-strength-finder-local`
- `prostyle-strength-finder-staging`
- `prostyle-strength-finder-prod`

## Key Prefix Contract

Allowed prefixes:
- `baseline/`
- `generated/`
- `reference/`
- `uploads/`
- `analysis-artifacts/`

Example key:
- `uploads/user_123/2026-02-18/output_001.png`

## Metadata Contract

Recommended metadata fields:
- `content_type`
- `source_type`
- `uploader_id`
- `created_at`

## IAM Guardrails

Minimum policy expectations:
- only required bucket access (`s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`)
- environment-scoped principals
- no wildcard write access across environments

## Lifecycle Defaults

Suggested lifecycle baseline:
- retain critical baseline/reference artifacts longer
- shorter retention for transient analysis artifacts
- explicitly document retention classes before production launch
