import { randomUUID } from 'node:crypto';
import type {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';

import { resolverConexao } from './ambiente';
import { findClienteByDocumento } from './clientes.repository';
import { isValidCpf, normalizeCpf } from './cpf';
import { signClienteToken } from './jwt';
import { log } from './logger';

const CORRELATION_HEADER = 'x-request-id';

function respond(
  statusCode: number,
  body: Record<string, unknown>,
  correlationId: string,
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json',
      [CORRELATION_HEADER]: correlationId,
    },
    body: JSON.stringify(body),
  };
}

export async function handler(
  event: APIGatewayProxyEvent,
  context?: Context,
): Promise<APIGatewayProxyResult> {
  // Reaproveita o correlation-id de quem chamou; se não vier, cria um. É o
  // mesmo header que a app propaga, então uma requisição dá pra ser seguida
  // ponta a ponta no New Relic.
  const headers = event.headers ?? {};
  const correlationId =
    headers[CORRELATION_HEADER] ??
    headers[CORRELATION_HEADER.toUpperCase()] ??
    context?.awsRequestId ??
    randomUUID();

  let documento: string;
  try {
    const body = JSON.parse(event.body ?? '{}') as { cpf?: unknown };
    if (typeof body.cpf !== 'string') {
      log('warn', 'requisicao sem campo cpf', { correlationId });
      return respond(400, { message: 'Campo "cpf" é obrigatório' }, correlationId);
    }
    documento = normalizeCpf(body.cpf);
  } catch {
    log('warn', 'body invalido', { correlationId });
    return respond(400, { message: 'Body inválido: esperado JSON' }, correlationId);
  }

  if (!isValidCpf(documento)) {
    log('warn', 'cpf invalido', { correlationId });
    return respond(400, { message: 'CPF inválido' }, correlationId);
  }

  // Qual banco responder depende do alias invocado, não de uma variável
  // global: os dois aliases podem compartilhar a mesma versão publicada.
  let ambiente: string;
  let databaseUrl: string;
  try {
    ({ ambiente, databaseUrl } = resolverConexao(context?.invokedFunctionArn));
  } catch (error) {
    log('error', 'nao foi possivel resolver o ambiente', {
      correlationId,
      error: error instanceof Error ? error.message : String(error),
    });
    return respond(500, { message: 'Erro de configuração' }, correlationId);
  }

  let cliente: Awaited<ReturnType<typeof findClienteByDocumento>>;
  try {
    cliente = await findClienteByDocumento(documento, ambiente, databaseUrl);
  } catch (error) {
    log('error', 'falha ao consultar cliente no banco', {
      correlationId,
      error: error instanceof Error ? error.message : String(error),
    });
    return respond(500, { message: 'Erro ao consultar cliente' }, correlationId);
  }

  if (!cliente) {
    log('warn', 'cliente nao encontrado', { correlationId });
    return respond(404, { message: 'Cliente não encontrado' }, correlationId);
  }

  if (!cliente.ativo) {
    log('warn', 'cliente inativo', { correlationId, clienteId: cliente.id });
    return respond(403, { message: 'Cliente inativo' }, correlationId);
  }

  const accessToken = signClienteToken(cliente.id, documento);
  log('info', 'token emitido', { correlationId, clienteId: cliente.id });

  return respond(
    200,
    { accessToken, cliente: { id: cliente.id, nome: cliente.nome } },
    correlationId,
  );
}
