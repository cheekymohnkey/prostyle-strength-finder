# Terraform Output to App Env Mapping

Use Terraform outputs from each stack to populate app environment templates.

## Required Mappings

- Terraform output `s3_bucket` -> app env `S3_BUCKET`
- Terraform output `sqs_queue_url` -> app env `SQS_QUEUE_URL`
- Terraform output `sqs_dlq_url` -> app env `SQS_DLQ_URL`
- Terraform output `aws_region` -> app env `AWS_REGION`

## Template Targets

- UAT stack outputs -> `.env.uat.example`
- Prod stack outputs -> `.env.prod.example`

## Retrieval

From an environment stack directory:

```bash
terraform output
```

Or specific values:

```bash
terraform output -raw s3_bucket
terraform output -raw sqs_queue_url
terraform output -raw sqs_dlq_url
terraform output -raw aws_region
```
