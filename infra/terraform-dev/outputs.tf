output "http_api_url" {
  description = "Base invoke URL for the dev HTTP API."
  value       = aws_apigatewayv2_stage.default.invoke_url
}

output "lambda_function_name" {
  description = "Deployed dev Lambda function name."
  value       = aws_lambda_function.api.function_name
}

output "lambda_role_name" {
  description = "Dev Lambda execution role name."
  value       = aws_iam_role.lambda_execution.name
}
