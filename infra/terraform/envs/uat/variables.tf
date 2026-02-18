variable "aws_region" {
  description = "AWS region for UAT resources."
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
  default     = "uat"

  validation {
    condition     = var.environment == "uat"
    error_message = "UAT stack must use environment=uat."
  }
}

variable "s3_bucket_name" {
  description = "UAT S3 bucket name."
  type        = string
  default     = "prostyle-strength-finder-uat"
}

variable "sqs_queue_name" {
  description = "UAT primary SQS queue name."
  type        = string
  default     = "prostyle-analysis-uat"
}

variable "sqs_dlq_name" {
  description = "UAT dead-letter queue name."
  type        = string
  default     = "prostyle-analysis-uat-dlq"
}

variable "max_receive_count" {
  description = "SQS max receive count before dead-lettering."
  type        = number
  default     = 5
}
