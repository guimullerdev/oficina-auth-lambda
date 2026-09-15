provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = "tech-challenge-fase3"
      Repo      = "oficina-auth-lambda"
      ManagedBy = "terraform"
    }
  }
}

# Mesma VPC default usada por oficina-infra-db — a Lambda precisa estar na
# VPC do RDS pra alcançar o banco, que é publicly_accessible = false.
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

resource "aws_security_group" "lambda" {
  name        = "oficina-auth-lambda-sg"
  description = "Egress da Lambda de auth por CPF (precisa alcancar o RDS na mesma VPC)"
  vpc_id      = data.aws_vpc.default.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# Em conta normal o Terraform cria a role; em AWS Academy Learner Lab
# (que bloqueia criação de IAM) passe `existing_role_arn` apontando pra LabRole.
locals {
  create_role = var.existing_role_arn == ""
  role_arn    = local.create_role ? aws_iam_role.lambda[0].arn : var.existing_role_arn
}

resource "aws_iam_role" "lambda" {
  count = local.create_role ? 1 : 0
  name  = "${var.function_name}-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

# Permite escrever logs no CloudWatch e criar as ENIs que a Lambda usa para
# entrar na VPC — sem isso a função não sobe com vpc_config.
resource "aws_iam_role_policy_attachment" "vpc_access" {
  count      = local.create_role ? 1 : 0
  role       = aws_iam_role.lambda[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_lambda_function" "auth_cpf" {
  function_name = var.function_name
  role          = local.role_arn
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  timeout       = 15
  memory_size   = 256

  filename         = var.package_path
  source_code_hash = filebase64sha256(var.package_path)

  vpc_config {
    subnet_ids         = data.aws_subnets.default.ids
    security_group_ids = [aws_security_group.lambda.id]
  }

  # Uma entrada por ambiente, e não uma `DATABASE_URL` só: variável de
  # ambiente pertence à versão publicada, não ao alias. Com os dois aliases
  # na mesma versão, uma chave única faria homologação e produção lerem o
  # mesmo banco. Quem escolhe entre elas é o handler, pelo alias invocado.
  environment {
    variables = {
      DATABASE_URL_HOMOLOG = var.database_url_homolog
      DATABASE_URL_PROD    = var.database_url_prod
      JWT_SECRET           = var.jwt_secret
      JWT_EXPIRES_IN       = var.jwt_expires_in
    }
  }

  publish = true
}

# Dois aliases apontando pra mesma função, um por ambiente (ver ADR 0002).
# Lambda não cobra por alias ocioso.
#
# O alias sozinho **não** separa configuração: `environment` pertence à versão
# publicada, e as duas apontam para a mesma. Quem separa de fato é o handler,
# que lê o alias de `context.invokedFunctionArn` e escolhe entre
# DATABASE_URL_HOMOLOG e DATABASE_URL_PROD (ver src/ambiente.ts).
resource "aws_lambda_alias" "environment" {
  for_each = toset(["homolog", "prod"])

  name             = each.key
  function_name    = aws_lambda_function.auth_cpf.function_name
  function_version = aws_lambda_function.auth_cpf.version
}
