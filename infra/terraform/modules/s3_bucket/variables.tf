variable "bucket_name" {
  description = "S3 bucket name. Must be globally unique."
  type        = string
}

variable "force_destroy" {
  description = "Allow bucket destroy with objects present. Keep false for safety."
  type        = bool
  default     = false
}

variable "analysis_artifacts_expiration_days" {
  description = "Retention window for transient analysis artifacts."
  type        = number
  default     = 30
}

variable "uploads_expiration_days" {
  description = "Retention window for uploads under uploads/."
  type        = number
  default     = 90
}

variable "bucket_policy_json" {
  description = "Optional JSON policy for least-privilege access."
  type        = string
  default     = null
}

variable "tags" {
  description = "Tags applied to all resources in this module."
  type        = map(string)
  default     = {}
}
