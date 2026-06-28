terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

locals {
  normalized_project = replace(var.project, ".", "-")
  name_prefix        = "${local.normalized_project}-dev"
  lambda_function    = "${local.name_prefix}-api"
  lambda_role        = "${local.name_prefix}-lambda-role"
  http_api_name      = "${local.name_prefix}-http-api"
  log_group_name     = "/aws/lambda/${local.lambda_function}"
}

data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda_execution" {
  name               = local.lambda_role
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

resource "aws_iam_role_policy_attachment" "lambda_basic_execution" {
  role       = aws_iam_role.lambda_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_cloudwatch_log_group" "lambda" {
  name              = local.log_group_name
  retention_in_days = var.log_retention_in_days
}

resource "aws_lambda_function" "api" {
  function_name = local.lambda_function
  role          = aws_iam_role.lambda_execution.arn
  runtime       = "nodejs22.x"
  handler       = "run.sh"
  architectures = [var.lambda_architecture]
  filename      = var.lambda_zip_path

  source_code_hash = filebase64sha256(var.lambda_zip_path)
  timeout          = var.lambda_timeout_seconds
  memory_size      = var.lambda_memory_mb

  layers = [
    var.lambda_architecture == "arm64"
    ? "arn:aws:lambda:${var.aws_region}:753240598075:layer:LambdaAdapterLayerArm64:25"
    : "arn:aws:lambda:${var.aws_region}:753240598075:layer:LambdaAdapterLayerX86:25"
  ]

  environment {
    variables = merge(
      {
        AWS_LAMBDA_EXEC_WRAPPER      = "/opt/bootstrap"
        PORT                         = tostring(var.app_port)
        AWS_LWA_PORT                 = tostring(var.app_port)
        AWS_LWA_READINESS_CHECK_PATH = var.readiness_check_path
        SUPABASE_URL                 = var.supabase_url
        SUPABASE_SERVICE_ROLE_KEY    = var.supabase_service_role_key
      },
      var.ai_engine_base_url == null ? {} : { AI_ENGINE_BASE_URL = var.ai_engine_base_url },
      var.matching_bff_internal_token == null ? {} : { MATCHING_BFF_INTERNAL_TOKEN = var.matching_bff_internal_token },
      var.matching_ticket_secret == null ? {} : { MATCHING_TICKET_SECRET = var.matching_ticket_secret },
    )
  }

  depends_on = [
    aws_cloudwatch_log_group.lambda,
    aws_iam_role_policy_attachment.lambda_basic_execution,
  ]
}

resource "aws_apigatewayv2_api" "http" {
  name          = local.http_api_name
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  integration_method     = "POST"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.http.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_lambda_permission" "allow_http_api" {
  statement_id  = "AllowExecutionFromHttpApi"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http.execution_arn}/*/*"
}
