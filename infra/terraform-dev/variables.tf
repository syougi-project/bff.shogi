variable "aws_region" {
  description = "AWS region where the dev stack will be created."
  type        = string
  default     = "ap-northeast-1"
}

variable "project" {
  description = "Project identifier used as the naming base."
  type        = string
  default     = "basi-magic.shogi"
}

variable "lambda_zip_path" {
  description = "Path to the Lambda zip artifact built from Next.js standalone output."
  type        = string
  default     = "../../dist/lambda.zip"
}

variable "lambda_architecture" {
  description = "Lambda CPU architecture."
  type        = string
  default     = "arm64"

  validation {
    condition     = contains(["arm64", "x86_64"], var.lambda_architecture)
    error_message = "lambda_architecture must be arm64 or x86_64."
  }
}

variable "lambda_memory_mb" {
  description = "Lambda memory size in MB."
  type        = number
  default     = 1024
}

variable "lambda_timeout_seconds" {
  description = "Lambda timeout in seconds."
  type        = number
  default     = 30
}

variable "log_retention_in_days" {
  description = "CloudWatch log retention in days."
  type        = number
  default     = 14
}

variable "app_port" {
  description = "Port exposed by the Next.js standalone server inside Lambda."
  type        = number
  default     = 8080
}

variable "readiness_check_path" {
  description = "HTTP path used by Lambda Web Adapter to verify the server is ready."
  type        = string
  default     = "/api/health"
}

variable "dev_supabase_url" {
  description = "Dev Supabase project URL for the backend."
  type        = string
  sensitive   = true
}

variable "dev_supabase_service_role_key" {
  description = "Dev Supabase service role key used by the backend."
  type        = string
  sensitive   = true
}

variable "ai_engine_base_url" {
  description = "Optional dev AI engine base URL."
  type        = string
  default     = null
  sensitive   = true
  nullable    = true
}

variable "matching_bff_internal_token" {
  description = "Optional dev shared token for internal matching BFF calls."
  type        = string
  default     = null
  sensitive   = true
  nullable    = true
}

variable "matching_ticket_secret" {
  description = "Optional dev HMAC secret for matchmaking tickets."
  type        = string
  default     = null
  sensitive   = true
  nullable    = true
}
