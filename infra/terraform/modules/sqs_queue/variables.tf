variable "queue_name" {
  description = "Primary SQS queue name."
  type        = string
}

variable "dlq_name" {
  description = "Dead-letter queue name. Defaults to <queue_name>-dlq."
  type        = string
  default     = null
}

variable "max_receive_count" {
  description = "Number of receive attempts before dead-lettering."
  type        = number
  default     = 5
}

variable "visibility_timeout_seconds" {
  description = "Visibility timeout for in-flight messages."
  type        = number
  default     = 60
}

variable "message_retention_seconds" {
  description = "How long messages are retained in the primary queue."
  type        = number
  default     = 345600
}

variable "tags" {
  description = "Tags applied to both queues."
  type        = map(string)
  default     = {}
}
