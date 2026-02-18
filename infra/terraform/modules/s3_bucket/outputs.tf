output "bucket_name" {
  description = "Provisioned bucket name."
  value       = aws_s3_bucket.this.bucket
}

output "bucket_arn" {
  description = "Provisioned bucket ARN."
  value       = aws_s3_bucket.this.arn
}
