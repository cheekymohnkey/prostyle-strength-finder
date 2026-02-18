locals {
  common_tags = {
    project     = "prostyle-strength-finder"
    environment = var.environment
    managed_by  = "terraform"
  }
}

module "s3_bucket" {
  source = "../../modules/s3_bucket"

  bucket_name = var.s3_bucket_name
  tags        = local.common_tags
}

module "sqs_queue" {
  source = "../../modules/sqs_queue"

  queue_name        = var.sqs_queue_name
  dlq_name          = var.sqs_dlq_name
  max_receive_count = var.max_receive_count
  tags              = local.common_tags
}
