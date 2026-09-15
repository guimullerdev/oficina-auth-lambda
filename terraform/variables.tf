variable "aws_region" {
  description = "Região AWS — precisa ser a mesma do RDS (oficina-infra-db)"
  type        = string
  default     = "us-east-1"
}

variable "function_name" {
  type    = string
  default = "oficina-auth-cpf"
}

variable "package_path" {
  description = "Caminho do zip gerado por `npm run package`"
  type        = string
  default     = "../function.zip"
}

variable "database_url_homolog" {
  description = "Connection string do database oficina_homolog — vem do output de oficina-infra-db/bootstrap-db, via secret do pipeline"
  type        = string
  sensitive   = true

  # Um secret que não existe no GitHub vira TF_VAR_* com string vazia, e
  # `type = string` sem default aceita isso como valor legítimo: o apply
  # passa e publica a função com credencial nenhuma. Foi o que aconteceu no
  # merge do PR #4 — autenticação caiu em produção com apply "bem-sucedido".
  validation {
    condition     = trimspace(var.database_url_homolog) != ""
    error_message = "database_url_homolog está vazia. Confira o secret DATABASE_URL_HOMOLOG no repositório."
  }
}

variable "database_url_prod" {
  description = "Connection string do database oficina_prod — vem do output de oficina-infra-db/bootstrap-db, via secret do pipeline"
  type        = string
  sensitive   = true

  # Um secret que não existe no GitHub vira TF_VAR_* com string vazia, e
  # `type = string` sem default aceita isso como valor legítimo: o apply
  # passa e publica a função com credencial nenhuma. Foi o que aconteceu no
  # merge do PR #4 — autenticação caiu em produção com apply "bem-sucedido".
  validation {
    condition     = trimspace(var.database_url_prod) != ""
    error_message = "database_url_prod está vazia. Confira o secret DATABASE_URL_PROD no repositório."
  }
}

variable "jwt_secret" {
  description = "Mesmo JWT_SECRET da app, senão o JwtAuthGuard rejeita o token emitido aqui"
  type        = string
  sensitive   = true
}

variable "jwt_expires_in" {
  type    = string
  default = "1h"
}

variable "existing_role_arn" {
  description = "ARN de uma IAM role já existente para a Lambda usar. Deixe vazio para o Terraform criar a role. Necessário em contas AWS Academy Learner Lab, que bloqueiam criação de roles — nesse caso passe o ARN da LabRole."
  type        = string
  default     = ""
}
