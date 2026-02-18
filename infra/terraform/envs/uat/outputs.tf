output "aws_region" {
  description = "Maps to AWS_REGION"
  value       = var.aws_region
}

output "s3_bucket" {
  description = "Maps to S3_BUCKET"
  value       = module.s3_bucket.bucket_name
}

output "sqs_queue_url" {
  description = "Maps to SQS_QUEUE_URL"
  value       = module.sqs_queue.queue_url
}

output "sqs_dlq_url" {
  description = "Maps to SQS_DLQ_URL"
  value       = module.sqs_queue.dlq_url
}
