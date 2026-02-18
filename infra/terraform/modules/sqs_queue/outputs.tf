output "queue_url" {
  description = "Primary queue URL."
  value       = aws_sqs_queue.primary.id
}

output "queue_arn" {
  description = "Primary queue ARN."
  value       = aws_sqs_queue.primary.arn
}

output "dlq_url" {
  description = "Dead-letter queue URL."
  value       = aws_sqs_queue.dlq.id
}

output "dlq_arn" {
  description = "Dead-letter queue ARN."
  value       = aws_sqs_queue.dlq.arn
}
