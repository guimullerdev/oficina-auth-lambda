output "function_name" {
  value = aws_lambda_function.auth_cpf.function_name
}

output "function_arn" {
  description = "ARN da função — consumido pelo API Gateway (Fase 6) para rotear POST /auth/cpf"
  value       = aws_lambda_function.auth_cpf.arn
}

output "alias_arns" {
  description = "ARN de cada alias (homolog/prod) — cada stage do API Gateway invoca o seu"
  value       = { for env, alias in aws_lambda_alias.environment : env => alias.arn }
}

output "security_group_id" {
  description = "SG da Lambda — se um dia o SG do RDS for restringido além do CIDR da VPC, é este que precisa ser liberado"
  value       = aws_security_group.lambda.id
}
