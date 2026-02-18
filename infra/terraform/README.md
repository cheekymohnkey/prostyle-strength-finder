# Terraform IaC - AWS Storage and Queue Foundations

This directory provisions non-local infrastructure for Prostyle Strength Finder.

Current non-local environments in scope:
- `uat`
- `prod`

Local remains outside Terraform provisioning for now.

## Provisioned Resources

Per environment stack:
- 1 S3 bucket with:
  - versioning enabled
  - default server-side encryption (AES256)
  - public access block enabled
  - lifecycle rules for transient prefixes
- 1 SQS primary queue + 1 DLQ with redrive policy

## Directory Layout

- `modules/s3_bucket`: reusable S3 module
- `modules/sqs_queue`: reusable SQS module
- `envs/uat`: UAT stack
- `envs/prod`: prod stack

## Prerequisites

1. Terraform >= 1.5.0 installed.
2. AWS CLI configured with profiles for target account(s).
3. IAM identity with rights for S3 and SQS provisioning.

## Commands

Run from each environment directory.

Example: UAT

```bash
cd infra/terraform/envs/uat
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform validate
terraform plan -out=tfplan
terraform apply tfplan
```

Example: prod

```bash
cd infra/terraform/envs/prod
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform validate
terraform plan -out=tfplan
terraform apply tfplan
```

Destroy (intentional/manual only):

```bash
terraform plan -destroy -out=tfdestroy
terraform apply tfdestroy
```

## Safety Checks

1. Confirm AWS account before apply:

```bash
aws sts get-caller-identity --profile <profile>
```

2. Ensure `environment` in `terraform.tfvars` matches stack directory (`uat` vs `prod`).
3. Always review `terraform plan` output before `apply`.
4. Keep `force_destroy=false` for buckets unless break-glass teardown is explicitly approved.

## Rollback Guidance

1. If an apply partially succeeds, re-run `terraform plan` and reconcile drift through Terraform.
2. Use targeted updates only when necessary and documented.
3. For high-risk changes, revert module input values and apply again rather than console edits.
4. Avoid manual console changes; if emergency changes occur, import or reconcile state promptly.

## Output Mapping

See `infra/terraform/ENV_OUTPUT_MAPPING.md` for application environment variable mapping.
