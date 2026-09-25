# Terraform deployment

This directory provisions a single Lambda function behind an API Gateway HTTP API.

## What Terraform creates

- Lambda execution role
- Lambda function for the Next.js standalone server
- CloudWatch Logs group
- API Gateway HTTP API
- Default route and stage
- Lambda invoke permission for API Gateway

## Build the zip artifact

From the repository root:

```bash
bun run build:lambda
```

This produces `dist/lambda.zip`.

## Configure variables

Copy the example file and fill in your values:

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
```

Required values:

- `supabase_url`
- `supabase_service_role_key`

Optional value:

- `ai_engine_base_url`
- `matching_bff_internal_token`
- `matching_ticket_secret`

## Deploy

```bash
cd infra/terraform
terraform init -migrate-state
terraform plan
terraform apply
```

State is stored in S3 at `basi-magic-shogi-terraform-state-apne1` with server-side encryption,
versioning, public-access block, and S3 lockfile enabled.

## GitHub Actions CD

The repository includes `.github/workflows/deploy-prod.yml`.

It does the following:

- runs `bun run build:lambda`
- runs `terraform init`
- runs `terraform plan`
- runs `terraform apply` on pushes to `main`

Required GitHub repository secrets:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `TF_VAR_supabase_url`
- `TF_VAR_supabase_service_role_key`

Optional GitHub repository secret:

- `TF_VAR_ai_engine_base_url`
- `TF_VAR_matching_bff_internal_token`
- `TF_VAR_matching_ticket_secret`

The workflow also expects these repository variables:

- `AWS_REGION` with value `ap-northeast-1`

If you do not set `AWS_REGION`, the workflow falls back to `ap-northeast-1`.

## Why these settings exist

- `output = "standalone"` in `next.config.ts`
  Next.js emits `.next/standalone`, which contains only the traced files needed to run the server.
- `run.sh`
  Lambda Web Adapter needs a startup script as the handler for zip-based Lambda functions.
- `AWS_LAMBDA_EXEC_WRAPPER=/opt/bootstrap`
  This tells Lambda to boot the web adapter layer before starting the Next.js server.
- `readiness_check_path = "/api/health"`
  The adapter waits for a healthy response before it starts forwarding API Gateway traffic.
