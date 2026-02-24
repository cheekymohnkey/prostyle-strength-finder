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

## Deterministic Shared-Mode Evidence Workflow

1. Use deterministic retention directory + file names:
- `RUN_TS_UTC=$(date -u +"%Y%m%dT%H%M%SZ")`
- `RETENTION_DIR=tmp/style-dna-evidence/shared-ci/${APP_ENV}/${RUN_TS_UTC}`
- `CI_OUTPUT_JSON=${RETENTION_DIR}/shared_upload_ci_result.json`
- `CI_OUTPUT_LOG=${RETENTION_DIR}/shared_upload_ci_result.log`
- `ARTIFACT_DIR=tmp/style-dna-taxonomy-rollouts`
- `UPLOAD_PREFIX=uploads/style-dna/taxonomy-rollouts-ci/shared/${APP_ENV}/${RUN_TS_UTC}`

2. Execute CI wrapper in shared mode and persist machine-readable output:
```bash
mkdir -p "${RETENTION_DIR}"
APP_ENV=prod \
S3_BUCKET=<bucket_name> \
AWS_REGION=<region> \
npm run style-dna:taxonomy-seed-rollout-artifacts-upload-ci -- --storage-policy-mode shared \
  | tee "${CI_OUTPUT_LOG}" \
  > "${CI_OUTPUT_JSON}"
```

3. Generate persistent evidence package (CI smoke paths are ephemeral by design):
```bash
npm run style-dna:taxonomy-seed-rollout-artifacts -- \
  --file scripts/style-dna/seeds/style-dna-taxonomy-seed-v2.json \
  --artifact-dir "${ARTIFACT_DIR}" \
  --run-id "shared_evidence_${APP_ENV}_${RUN_TS_UTC}" \
  --min-canonical 4 \
  --min-aliases 16

npm run style-dna:taxonomy-seed-rollout-artifacts-export -- \
  --artifact-dir "${ARTIFACT_DIR}" \
  --destination-dir "${RETENTION_DIR}" \
  --run-id "shared_evidence_${APP_ENV}_${RUN_TS_UTC}"
```

4. Upload exported package with deterministic storage prefix:
```bash
npm run style-dna:taxonomy-seed-rollout-artifacts-upload -- \
  --manifest-path "${RETENTION_DIR}/shared_evidence_${APP_ENV}_${RUN_TS_UTC}__export_manifest.json" \
  --destination-policy storage-adapter \
  --storage-prefix "${UPLOAD_PREFIX}"
```

5. Required handover evidence fields:
- command (full command string used for shared mode)
- env contract values (`APP_ENV`, `S3_BUCKET`, `AWS_REGION`, optional `S3_ENDPOINT_OVERRIDE`)
- `runId`
- `manifestPath`
- `receiptPath`
- `receiptId`
- `storagePrefix`
- local retention directory path (`RETENTION_DIR`)

6. Retention policy:
- local CI workspace evidence (`tmp/style-dna-evidence/shared-ci/*`): retain at least 14 days
- uploaded shared-mode evidence packages (`uploads/style-dna/taxonomy-rollouts-ci/shared/*`): retain at least 90 days
- do not prune remote prefixes referenced by the latest handover until a superseding handover includes replacement evidence

## Handover Copy/Paste Block (Shared Mode)

```text
Shared-mode CI Evidence
- date_utc: <YYYY-MM-DD>
- command: <full command>
- env_contract:
  - APP_ENV: <value>
  - S3_BUCKET: <value>
  - AWS_REGION: <value>
  - S3_ENDPOINT_OVERRIDE: <value_or_empty>
- runId: <run_id>
- manifestPath: <absolute_or_repo-relative_path>
- receiptPath: <absolute_or_repo-relative_path>
- receiptId: <receipt_hash>
- storagePrefix: <uploads/style-dna/...>
- retentionDir: <tmp/style-dna-evidence/shared-ci/...>
- freshnessStatus: <fresh|stale>
- freshnessCheckedAtUtc: <YYYY-MM-DDTHH:mm:ssZ>
- governanceStatus: <fresh|stale>
- governanceStatusPath: <tmp/style-dna-evidence/shared-ci/.../latest_governance_status.json>
```

## Recurring Evidence Governance

1. Execution cadence:
- minimum cadence: one shared-mode evidence run per release candidate
- recommended cadence: weekly while Style-DNA admin changes are actively landing
- trigger cadence override: run immediately after any storage-adapter, upload, or rollout artifact contract change

2. Ownership model:
- release owner: runs shared-mode evidence workflow and posts handover evidence block
- infra owner: validates provider/IAM readiness for shared mode and storage prefix access
- on-call maintainer: monitors retention windows and executes cleanup outside protected retention scope

3. Freshness policy:
- evidence is `fresh` when latest successful shared-mode run is within 7 days
- evidence is `stale` when latest successful shared-mode run is older than 7 days
- release must not be marked ready with `stale` evidence unless an explicit risk waiver is recorded in handover

4. Handover freshness checklist:
- confirm latest retained `retentionDir` exists and contains manifest + receipt artifacts
- confirm uploaded `storagePrefix` is reachable for latest run
- compute age from latest `freshnessCheckedAtUtc` and set `freshnessStatus`
- if `stale`, include owner, remediation command, and target completion date

5. Retention monitoring checklist:
- weekly: verify local retention root `tmp/style-dna-evidence/shared-ci/*` has no required artifacts older than 14 days pending handover reference
- weekly: verify remote retention root `uploads/style-dna/taxonomy-rollouts-ci/shared/*` keeps at least 90 days of evidence for active release line
- before prune: confirm latest handover references a newer replacement `storagePrefix`

## Evidence Governance Validator (SDNA-31)

1. Command:
- `npm run style-dna:taxonomy-seed-evidence-governance-check`

2. Primary options:
- `--retention-root <dir>` (default: `tmp/style-dna-evidence/shared-ci`)
- `--app-env <name>` (optional filter, for example `prod`)
- `--max-age-days <n>` (default: `7`)
- `--output <path>` (write JSON summary artifact)
- `--fail-on-stale` (exit `1` when status is `stale`)

3. Deterministic JSON output contract:
Top-level fields: `ok`, `generatedAtUtc`, `retentionRoot`, `appEnvFilter`, `maxAgeDays`, `status` (`fresh|stale`), `reason` (`within_threshold|no_evidence|stale_environment_detected`), `staleEnvironmentCount`, `staleEnvironments`, `latestEvidence`, `environments`.
Environment entry fields: `appEnv`, `runCount`, `status`, `reason` (`within_threshold|no_evidence|missing_required_artifacts|older_than_threshold`), `latestEvidence` (`retentionDir`, `capturedAtUtc`, `ageDays`, `manifestPath`, `receiptPath`, `manifestExists`, `receiptExists`).

4. CI/reporting integration examples:
- warning-only reporting artifact:
```bash
npm run style-dna:taxonomy-seed-evidence-governance-check -- \
  --app-env prod \
  --max-age-days 7 \
  --output tmp/style-dna-evidence/shared-ci/prod/latest_governance_status.json
```
- hard gate (fail CI when stale):
```bash
npm run style-dna:taxonomy-seed-evidence-governance-check -- \
  --app-env prod \
  --max-age-days 7 \
  --fail-on-stale \
  --output tmp/style-dna-evidence/shared-ci/prod/latest_governance_status.json
```

5. Handover governance artifact reference:
- include `governanceStatusPath` and `governanceStatus` from validator output in the session handover when shared-mode evidence is part of release readiness evidence.

## Shared CI/Release Adoption (SDNA-32)

1. Default policy:
- shared CI/release runs should execute governance check in hard-gate mode by default (`--fail-on-stale`)
- warning-only mode is allowed for non-blocking branches or exploratory environments

2. Canonical pipeline snippet (warning-only vs hard-gate):
```bash
# Common vars (example)
export APP_ENV=prod
export GOVERNANCE_STATUS_PATH="tmp/style-dna-evidence/shared-ci/${APP_ENV}/latest_governance_status.json"

# Warning-only mode (non-blocking)
npm run style-dna:taxonomy-seed-evidence-governance-check -- \
  --app-env "${APP_ENV}" \
  --max-age-days 7 \
  --output "${GOVERNANCE_STATUS_PATH}"

# Hard-gate mode (default for release/shared CI)
npm run style-dna:taxonomy-seed-evidence-governance-check -- \
  --app-env "${APP_ENV}" \
  --max-age-days 7 \
  --fail-on-stale \
  --output "${GOVERNANCE_STATUS_PATH}"
```

3. CI artifact persistence requirement:
- always publish `${GOVERNANCE_STATUS_PATH}` as a CI job artifact
- keep at least the latest successful governance status artifact per environment
- when hard-gate fails, publish the stale status artifact so release triage has deterministic evidence

4. Release checklist integration:
- run shared-mode evidence workflow
- run governance check in hard-gate mode
- attach `latest_governance_status.json` artifact link/path to handover entry as `governanceStatusPath`

5. Repo CI workflow wiring (implemented):
- workflow file: `.github/workflows/style-dna-evidence-governance.yml`
- job id: `style_dna_evidence_governance`
- default mode: hard-gate (`enforcement_mode=hard-gate`)
- optional mode: warning-only (`enforcement_mode=warning-only`)
- artifact name pattern: `style-dna-governance-status-<app_env>`

## SDNA-34 Execution Runbook (CI Verification)

1. Preconditions:
- GitHub CLI authenticated: `gh auth status`
- workflow exists on target branch: `.github/workflows/style-dna-evidence-governance.yml`

2. Trigger warning-only verification run:
```bash
gh workflow run "Style DNA Evidence Governance" \
  --ref main \
  -f app_env=prod \
  -f max_age_days=7 \
  -f enforcement_mode=warning-only
```

3. Trigger hard-gate verification run:
```bash
gh workflow run "Style DNA Evidence Governance" \
  --ref main \
  -f app_env=prod \
  -f max_age_days=7 \
  -f enforcement_mode=hard-gate
```

4. List and inspect recent runs:
```bash
gh run list --workflow "Style DNA Evidence Governance" --limit 10
gh run view <run_id> --log
```

5. Download governance artifact from a run:
```bash
gh run download <run_id> \
  --name style-dna-governance-status-prod \
  --dir tmp/style-dna-evidence/ci-downloads/<run_id>
```

6. Schedule verification checklist:
- confirm at least one Monday scheduled run appears in workflow run history
- confirm scheduled run uploads `style-dna-governance-status-<app_env>` artifact
- confirm stale hard-gate failures notify designated owner channel/on-call target

## SDNA-34 Handover Evidence Block

```text
CI Rollout Verification
- workflowPath: .github/workflows/style-dna-evidence-governance.yml
- jobId: style_dna_evidence_governance
- warningOnlyRun:
  - runId: <id>
  - conclusion: <success|failure>
  - artifactName: style-dna-governance-status-<app_env>
  - artifactPath: <local_download_path_or_link>
- hardGateRun:
  - runId: <id>
  - conclusion: <success|failure>
  - artifactName: style-dna-governance-status-<app_env>
  - artifactPath: <local_download_path_or_link>
- scheduleVerification:
  - scheduledRunId: <id_or_pending>
  - ownershipNotificationVerified: <yes|no>
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
12. `npm run style-dna:taxonomy-seed-evidence-governance-check`

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
