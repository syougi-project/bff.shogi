# Dev Terraform deployment

This root provisions an isolated dev Lambda and API Gateway HTTP API. It does not
share Terraform state or AWS resources with `infra/terraform`.

## Resources

- Lambda: `basi-magic-shogi-dev-api`
- API Gateway: `basi-magic-shogi-dev-http-api`
- IAM role and CloudWatch log group dedicated to dev
- S3 state key: `basi-magic-shogi/dev/terraform.tfstate`

## Local deployment

From the repository root:

```bash
bun run build:lambda
cp infra/terraform-dev/terraform.tfvars.example infra/terraform-dev/terraform.tfvars
# Fill in dev-only Supabase credentials.
terraform -chdir=infra/terraform-dev init
terraform -chdir=infra/terraform-dev plan
terraform -chdir=infra/terraform-dev apply
```

The API URL is printed as the `http_api_url` output after apply.

## GitHub Actions

`.github/workflows/deploy-dev.yml` runs separate plan and apply jobs on pushes to
`dev`. Configure these dev-specific repository secrets:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `DEV_SUPABASE_URL`
- `DEV_SUPABASE_SERVICE_ROLE_KEY`

Optional secrets:

- `TF_VAR_ai_engine_base_url`
- `TF_VAR_matching_bff_internal_token`
- `TF_VAR_matching_ticket_secret`

Set `AWS_REGION` as a repository variable if a region other than
`ap-northeast-1` is required.
