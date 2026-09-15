# oficina-auth-lambda

> Repositório 2 de 4 — Tech Challenge Fase 3 (SOAT).

Function Serverless que autentica o **cliente da oficina por CPF** e devolve
um JWT válido para consumir as APIs protegidas da aplicação principal.

É o único caminho de login do cliente: usuários internos (ADMIN, ATENDENTE,
MECANICO) continuam autenticando por email/senha na própria app, com o
mecanismo dela. Os dois fluxos convivem — ver "Como o token conversa com a
app" abaixo.

## Stack

- Node.js 22 (TypeScript), empacotado em zip via esbuild
- AWS Lambda, dentro da VPC do RDS
- `pg` para consulta direta ao PostgreSQL, `jsonwebtoken` para assinar o token
- Jest para os testes unitários
- Terraform para provisionar a função; GitHub Actions para CI/CD

## Fluxo

```
Cliente → API Gateway (POST /auth/cpf) → esta Lambda
                                            ├─ valida formato + dígito verificador do CPF
                                            ├─ SELECT em clientes (documento, ativo) no RDS
                                            └─ assina e devolve o JWT
```

A Lambda consulta o **RDS diretamente**, não chama a API principal. O motivo
está na RFC 0003 do repo da app: um endpoint dedicado para essa consulta
teria que ser público (a Lambda roda *antes* de existir token), o que
recriaria exatamente o problema que ela existe para resolver.

### Contrato

`POST /auth/cpf`

```jsonc
// request
{ "cpf": "529.982.247-25" }   // aceita com ou sem pontuação

// 200
{ "accessToken": "eyJhbGci...", "cliente": { "id": "uuid", "nome": "Ana" } }
```

| Status | Quando |
|---|---|
| 200 | CPF válido, cliente existe e está ativo |
| 400 | CPF ausente, malformado, ou com dígito verificador inválido |
| 404 | Nenhum cliente com esse documento |
| 403 | Cliente existe mas está inativo |
| 500 | Falha ao consultar o banco |

O header `x-request-id` é ecoado na resposta (ou gerado, se não vier), e
aparece em todo log estruturado emitido durante a invocação — é o que permite
correlacionar uma requisição entre a Lambda e a app no New Relic (ADR 0004).

### Como o token conversa com a app

O token é assinado em HS256 com o **mesmo `JWT_SECRET`** que a aplicação usa
para validar. Nenhuma chamada de rede entre os dois; o acoplamento é só o
segredo compartilhado, distribuído como secret de pipeline em cada repo
(ADR 0001).

Claims emitidas:

```jsonc
{ "sub": "<clienteId>", "documento": "<11 dígitos>", "role": "CLIENTE" }
```

Sem `email` — o campo é opcional em `Cliente`. O `role: CLIENTE` é o que o
`RolesGuard` da app usa para distinguir cliente de staff.

## Pré-requisitos

- Node.js 22+
- Para deploy: Terraform >= 1.9 e credenciais AWS com permissão de Lambda,
  EC2 (VPC/SG) e IAM
- RDS já provisionado por `oficina-infra-db`, com os databases lógicos
  criados (o submódulo `bootstrap-db` daquele repo)

## Rodando local

```bash
npm install
npm test
```

Os testes cobrem a validação de CPF (incluindo dígito verificador,
sequências repetidas e CNPJ) e o handler inteiro, com o banco mockado — não
precisa de AWS nem de Postgres para rodar.

Para gerar o artefato de deploy:

```bash
npm run package   # gera function.zip
```

## Deploy

```bash
cd terraform
terraform init -backend-config=backend.hcl
terraform apply
```

Variáveis obrigatórias (`database_url` e `jwt_secret`) são sensíveis e vêm
de secrets do pipeline, nunca versionadas.

> **Conta AWS Academy Learner Lab**: o ambiente bloqueia criação de IAM
> roles. Nesse caso passe `existing_role_arn` com o ARN da `LabRole` — o
> Terraform pula a criação da role e usa a que já existe.

## Pipeline

`.github/workflows/ci-cd.yml`:

- **Pull request para `main`**: typecheck → testes com cobertura → empacota
  o zip e publica como artifact. É o gate de merge.
- **Push em `main`** (pós-merge): repete o build e roda `terraform apply`,
  atualizando a função e os aliases.

Secrets necessários no repositório: `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`, `DATABASE_URL_HOMOLOG`, `DATABASE_URL_PROD`,
`JWT_SECRET` e — só se a conta for Learner Lab — `AWS_SESSION_TOKEN` e
`LAMBDA_ROLE_ARN`.

## Sobre o Dockerfile

Não se aplica a este repositório. A função é empacotada como **zip** (62 KB),
não como container image — é o formato nativo da Lambda, tem cold start menor
e dispensa manter um registry para uma função de um arquivo só. O bundle é
gerado pelo esbuild (`npm run package`), sem `node_modules` no artefato.

## Ambientes

Dois aliases da mesma função, `homolog` e `prod` (ADR 0002). O API Gateway
tem um stage por ambiente, cada um invocando seu alias. Lambda não cobra por
alias ocioso.

**O alias sozinho não separa configuração.** Variável de ambiente no Lambda
pertence à *versão publicada*, e os dois aliases apontam para a mesma versão
— uma `DATABASE_URL` única faria homologação e produção lerem o mesmo banco.
Foi exatamente o que aconteceu no primeiro deploy: `/homolog/auth/cpf`
autenticava clientes que só existiam em produção.

Quem separa de fato é o handler. A função recebe `DATABASE_URL_HOMOLOG` e
`DATABASE_URL_PROD`, lê o alias invocado de `context.invokedFunctionArn` e
escolhe a connection string correspondente (`src/ambiente.ts`). Cada ambiente
tem seu próprio pool de conexões, porque dois aliases na mesma versão podem
compartilhar o mesmo container quente.

Invocação sem alias (`$LATEST`, teste manual no console) **falha com 500**, de
propósito: qualquer default escolheria entre servir homologação com dados de
produção ou o contrário.

## Documentação relacionada

Vive no repo da aplicação (`TECH-CHALLENGE-FASE-ONE/docs/`):

- Diagrama de sequência deste fluxo: `docs/diagrams/0002-sequencia-autenticacao-cpf.md`
- Diagrama de componentes: `docs/diagrams/0001-diagrama-componentes.md`
- RFC 0003 — estratégia de autenticação por CPF
- ADR 0001 — padrão de comunicação entre os repos
- ADR 0004 — organização de logs e traces
