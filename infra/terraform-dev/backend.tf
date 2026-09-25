terraform {
  backend "s3" {
    bucket       = "manakana-shogi-terraform-state-apne"
    key          = "basi-magic-shogi/dev/terraform.tfstate"
    region       = "ap-northeast-1"
    encrypt      = true
    use_lockfile = true
  }
}
