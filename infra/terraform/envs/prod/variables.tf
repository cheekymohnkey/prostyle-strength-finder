variable "aws_region" {
  description = "AWS region for prod resources."
  type        = string
  default     = "us-east-1"
}

variable "aws_profile" {
  description = "AWS CLI profile used for Terraform operations."
  type        = string
  default     = "default"
}

variable "environment" {
  description = "Environment label."
  type        = string
  default     = "prod"

  validation {
    condition     = var.environment == "prod"
    error_message = "Prod stack must use environment=prod."
  }
}

variable "s3_bucket_name" {
  description = "Prod S3 bucket name."
  type        = string
  default     = "prostyle-strength-finder-prod"
}

variable "sqs_queue_name" {
  description = "Prod primary SQS queue name."
  type        = string
  default     = "prostyle-analysis-prod"
}

variable "sqs_dlq_name" {
  description = "Prod dead-letter queue name."
  type        = string
  default     = "prostyle-analysis-prod-dlq"
}

variable "max_receive_count" {
  description = "SQS max receive count before dead-lettering."
  type        = number
  default     = 5
}
