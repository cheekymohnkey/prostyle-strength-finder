# Style-DNA Taxonomy Seed Versioning Workflow

Status: In Progress  
Date: 2026-02-24  
Depends on:
- `design-documenatation/DECISIONS.md`
- `design-documenatation/TECHNICAL_DECISIONS.md`
- `design-documenatation/implementation/STYLE_DNA_ADMIN_IMPLEMENTATION_PLAN.md`
- `design-documenatation/implementation/STYLE_DNA_ADMIN_IMPLEMENTATION_TASKS.md`

## Purpose

Define the operator workflow for introducing new taxonomy seed bundle versions (for example `style_dna_v1 -> style_dna_v2`) with deterministic validation gates before and after apply.

## Seed Artifacts

1. Baseline seed bundle:
- `scripts/style-dna/seeds/style-dna-taxonomy-seed-v1.json`
2. Expanded seed bundle:
- `scripts/style-dna/seeds/style-dna-taxonomy-seed-v2.json`

## Rollout Checklist

1. Validate seed schema + coverage thresholds:
- `npm run style-dna:taxonomy-seed-coverage -- --file scripts/style-dna/seeds/style-dna-taxonomy-seed-v2.json --min-canonical 4 --min-aliases 16`
2. Preview drift against current DB state:
- `npm run style-dna:taxonomy-seed-diff -- --file scripts/style-dna/seeds/style-dna-taxonomy-seed-v2.json --output /tmp/style_dna_v2_diff.json`
3. Apply with enforced coverage gate:
- `npm run style-dna:taxonomy-seed-apply -- --file scripts/style-dna/seeds/style-dna-taxonomy-seed-v2.json --require-coverage --min-canonical 4 --min-aliases 16`
4. Re-run diff to confirm no unresolved gaps:
- `npm run style-dna:taxonomy-seed-diff -- --file scripts/style-dna/seeds/style-dna-taxonomy-seed-v2.json`
5. Generate consolidated rollout artifacts:
- `npm run style-dna:taxonomy-seed-rollout-artifacts -- --file scripts/style-dna/seeds/style-dna-taxonomy-seed-v2.json --artifact-dir tmp/style-dna-taxonomy-rollouts --run-id <rollout_id> --min-canonical 4 --min-aliases 16 --apply --require-coverage`
6. Index recent rollout artifacts:
- `npm run style-dna:taxonomy-seed-rollout-artifacts-index -- --artifact-dir tmp/style-dna-taxonomy-rollouts --limit 20`
7. Prune older rollout artifacts (dry-run first):
- `npm run style-dna:taxonomy-seed-rollout-artifacts-prune -- --artifact-dir tmp/style-dna-taxonomy-rollouts --keep 5`
- `npm run style-dna:taxonomy-seed-rollout-artifacts-prune -- --artifact-dir tmp/style-dna-taxonomy-rollouts --keep 5 --apply`
8. Export a selected rollout run for sharing/audit package:
- `npm run style-dna:taxonomy-seed-rollout-artifacts-export -- --artifact-dir tmp/style-dna-taxonomy-rollouts --destination-dir /tmp/style-dna-exports --run-id <rollout_id>`
- or export latest for a taxonomy version:
 - `npm run style-dna:taxonomy-seed-rollout-artifacts-export -- --artifact-dir tmp/style-dna-taxonomy-rollouts --destination-dir /tmp/style-dna-exports --latest --taxonomy-version style_dna_v2`
9. Upload exported package and generate deterministic receipt:
- `npm run style-dna:taxonomy-seed-rollout-artifacts-upload -- --manifest-path /tmp/style-dna-exports/<run_id>__export_manifest.json --upload-dir /tmp/style-dna-uploaded`
 - storage-adapter destination:
 - `npm run style-dna:taxonomy-seed-rollout-artifacts-upload -- --manifest-path /tmp/style-dna-exports/<run_id>__export_manifest.json --destination-policy storage-adapter --storage-prefix uploads/style-dna/taxonomy-rollouts`
10. Wrapper (export then upload in one step):
- `npm run style-dna:taxonomy-seed-rollout-artifacts-publish -- --artifact-dir tmp/style-dna-taxonomy-rollouts --destination-dir /tmp/style-dna-exports --run-id <rollout_id>`
 - storage-adapter destination:
 - `npm run style-dna:taxonomy-seed-rollout-artifacts-publish -- --artifact-dir tmp/style-dna-taxonomy-rollouts --destination-dir /tmp/style-dna-exports --run-id <rollout_id> --destination-policy storage-adapter --storage-prefix uploads/style-dna/taxonomy-rollouts`
11. CI wrapper for rollout upload smoke:
- isolated mode (default):
 - `npm run style-dna:taxonomy-seed-rollout-artifacts-upload-ci`
- shared-storage mode (uses current env contract):
 - `npm run style-dna:taxonomy-seed-rollout-artifacts-upload-ci -- --storage-policy-mode shared`

## Upload Destination Policy Notes

1. `style-dna:taxonomy-seed-rollout-artifacts-upload` supports `--destination-policy local|storage-adapter` (default: `local`).
2. `local` policy requires `--upload-dir`.
3. `storage-adapter` policy rejects `--upload-dir` and requires storage adapter env (`APP_ENV`, `S3_BUCKET`, `AWS_REGION`; optional `S3_ENDPOINT_OVERRIDE`).
4. `STYLE_DNA_ROLLOUT_UPLOAD_DESTINATION_POLICY` and `STYLE_DNA_ROLLOUT_UPLOAD_STORAGE_PREFIX` can be used as environment defaults.
5. CI wrapper supports `STYLE_DNA_ROLLOUT_UPLOAD_CI_STORAGE_POLICY_MODE=isolated|shared`.
6. Shared mode requires `APP_ENV`, `S3_BUCKET`, and `AWS_REGION`.

## Mode Glossary

1. `destination-policy` (`local|storage-adapter`):
- Used by upload/publish commands to decide where rollout packages are written.

2. `storage-policy-mode` (`isolated|shared`):
- Used by CI upload wrapper to decide how storage-adapter checks run.
- `isolated`: local fixture-backed adapter validation (deterministic default).
- `shared`: current-environment adapter validation (requires env contract).

## Shared-Env CI Runbook

1. Isolated CI mode (deterministic fixture-backed adapter validation):
```bash
npm run style-dna:taxonomy-seed-rollout-artifacts-upload-ci
```

2. Shared mode via CLI flag (uses current env contract):
```bash
APP_ENV=prod \
S3_BUCKET=<bucket_name> \
AWS_REGION=<region> \
npm run style-dna:taxonomy-seed-rollout-artifacts-upload-ci -- --storage-policy-mode shared
```

3. Shared mode via env default:
```bash
export STYLE_DNA_ROLLOUT_UPLOAD_CI_STORAGE_POLICY_MODE=shared
export APP_ENV=prod
export S3_BUCKET=<bucket_name>
export AWS_REGION=<region>
npm run style-dna:taxonomy-seed-rollout-artifacts-upload-ci
```

4. Optional endpoint override for S3-compatible providers:
```bash
APP_ENV=prod \
S3_BUCKET=<bucket_name> \
AWS_REGION=<region> \
S3_ENDPOINT_OVERRIDE=<provider_endpoint> \
npm run style-dna:taxonomy-seed-rollout-artifacts-upload-ci -- --storage-policy-mode shared
```

## Troubleshooting (CI Upload Wrapper)

1. Signature: `{ "reason": "invalid_env_contract", "message": "Missing required environment variable: APP_ENV" }`
- Meaning: shared mode selected but required env is missing.
- Action: set `APP_ENV`, `S3_BUCKET`, `AWS_REGION` before running shared mode.

2. Signature: `{ "reason": "invalid_env_contract", "message": "Invalid storage policy mode: ..." }`
- Meaning: unsupported `--storage-policy-mode` or env default value.
- Action: use only `isolated` or `shared`.

3. Signature: `{ "reason": "upload_smoke_failed", ... }` with storage adapter error output.
- Meaning: env contract exists, but provider/IAM/bucket access failed.
- Action: verify bucket name, region, credentials/role policy, and optional endpoint override.

4. Signature: `{ "reason": "upload_smoke_failed", ... }` with `source_file_missing`.
- Meaning: export manifest references files that were removed before upload.
- Action: re-run export and upload in the same CI step or preserve artifact workspace between steps.

## Verification Commands

1. `npm run contracts`
2. `npm run style-dna:taxonomy-seed-library-smoke`
3. `npm run style-dna:taxonomy-seed-diff-smoke`
4. `npm run style-dna:taxonomy-seed-coverage-smoke`
5. `npm run style-dna:taxonomy-seed-apply-coverage-smoke`
6. `npm run style-dna:taxonomy-seed-v2-rollout-smoke`
7. `npm run style-dna:taxonomy-seed-rollout-artifacts-smoke`
8. `npm run style-dna:taxonomy-seed-rollout-artifacts-index-prune-smoke`
9. `npm run style-dna:taxonomy-seed-rollout-artifacts-export-smoke`
10. `npm run style-dna:taxonomy-seed-rollout-artifacts-upload-smoke`
11. `npm run style-dna:taxonomy-seed-rollout-artifacts-upload-ci`

## Version Governance Notes

1. Do not mutate existing seed bundle files for released versions; add a new versioned file.
2. Keep `taxonomyVersion` aligned with file version (`v2` file uses `style_dna_v2`).
3. Treat coverage thresholds as explicit release criteria and capture any threshold changes in handoff notes.
4. Keep rollout command output artifacts (`--output`) for audit trails when running in shared environments.
5. Use consolidated artifact naming convention:
- `<run_id>__coverage.json`
- `<run_id>__diff_before.json`
- `<run_id>__apply.json`
- `<run_id>__diff_after.json`
- `<run_id>__summary.json`
