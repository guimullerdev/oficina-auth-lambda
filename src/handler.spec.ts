import jwt from 'jsonwebtoken';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';

import { findClienteByDocumento } from './clientes.repository';
import { handler } from './handler';

jest.mock('./clientes.repository');

const findCliente = findClienteByDocumento as jest.MockedFunction<
  typeof findClienteByDocumento
>;

const CPF_VALIDO = '52998224725';
const SECRET = 'segredo-de-teste';

function event(body: unknown, headers: Record<string, string> = {}) {
  return {
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers,
  } as unknown as APIGatewayProxyEvent;
}

function parse(body: string) {
  return JSON.parse(body) as Record<string, string>;
}

// O handler escolhe o banco pelo alias no ARN, então toda invocação precisa
// de um contexto — invocação sem alias é erro de configuração, e tem teste
// próprio para isso mais abaixo.
function contexto(alias = 'prod') {
  return {
    awsRequestId: 'ctx-request-id',
    invokedFunctionArn: `arn:aws:lambda:us-east-1:123456789012:function:oficina-auth-cpf:${alias}`,
  } as unknown as Context;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.JWT_SECRET = SECRET;
  process.env.DATABASE_URL_PROD = 'postgresql://u:p@host:5432/oficina_prod?sslmode=require';
  process.env.DATABASE_URL_HOMOLOG =
    'postgresql://u:p@host:5432/oficina_homolog?sslmode=require';
});

describe('handler — caminho feliz', () => {
  it('devolve JWT assinado com as claims do cliente', async () => {
    findCliente.mockResolvedValue({ id: 'cliente-1', nome: 'Ana', ativo: true });

    const response = await handler(event({ cpf: '529.982.247-25' }), contexto());

    expect(response.statusCode).toBe(200);
    const payload = jwt.verify(parse(response.body).accessToken, SECRET) as Record<
      string,
      unknown
    >;
    expect(payload).toMatchObject({
      sub: 'cliente-1',
      documento: CPF_VALIDO,
      role: 'CLIENTE',
    });
    // email não entra: é opcional em Cliente (ver plan.md, Fase 0)
    expect(payload.email).toBeUndefined();
  });

  it('consulta o banco com o CPF já normalizado', async () => {
    findCliente.mockResolvedValue({ id: 'cliente-1', nome: 'Ana', ativo: true });

    await handler(event({ cpf: '529.982.247-25' }), contexto());

    expect(findCliente).toHaveBeenCalledWith(
      CPF_VALIDO,
      'prod',
      expect.stringContaining('oficina_prod'),
    );
  });
});

describe('handler — recusas', () => {
  it('400 quando o CPF é inválido, sem tocar no banco', async () => {
    const response = await handler(event({ cpf: '11111111111' }), contexto());

    expect(response.statusCode).toBe(400);
    expect(findCliente).not.toHaveBeenCalled();
  });

  it('400 quando falta o campo cpf', async () => {
    expect((await handler(event({}), contexto())).statusCode).toBe(400);
  });

  it('400 quando o body não é JSON', async () => {
    expect((await handler(event('não é json'), contexto())).statusCode).toBe(400);
  });

  it('404 quando o cliente não existe', async () => {
    findCliente.mockResolvedValue(null);
    expect((await handler(event({ cpf: CPF_VALIDO }), contexto())).statusCode).toBe(404);
  });

  it('403 quando o cliente está inativo', async () => {
    findCliente.mockResolvedValue({ id: 'cliente-2', nome: 'Bruno', ativo: false });

    const response = await handler(event({ cpf: CPF_VALIDO }), contexto());

    expect(response.statusCode).toBe(403);
    expect(response.body).not.toContain('accessToken');
  });

  it('500 quando o banco falha', async () => {
    findCliente.mockRejectedValue(new Error('connection timeout'));
    expect((await handler(event({ cpf: CPF_VALIDO }), contexto())).statusCode).toBe(500);
  });
});

describe('handler — correlação de requisições', () => {
  it('propaga o x-request-id recebido', async () => {
    findCliente.mockResolvedValue({ id: 'cliente-1', nome: 'Ana', ativo: true });

    const response = await handler(
      event({ cpf: CPF_VALIDO }, { 'x-request-id': 'req-123' }),
      contexto(),
    );

    expect(response.headers?.['x-request-id']).toBe('req-123');
    // Sem o contexto, a resposta ainda traria o header — mas vinda do erro de
    // configuração, e não do caminho feliz que este teste quer cobrir.
    expect(response.statusCode).toBe(200);
  });

  it('gera um correlation-id quando não vem no header', async () => {
    findCliente.mockResolvedValue({ id: 'cliente-1', nome: 'Ana', ativo: true });

    const response = await handler(event({ cpf: CPF_VALIDO }), contexto());

    expect(response.headers?.['x-request-id']).toEqual(expect.any(String));
  });
});

describe('handler — separação de ambientes', () => {
  it('consulta o banco de homologação quando invocado pelo alias homolog', async () => {
    findCliente.mockResolvedValue({ id: 'cliente-1', nome: 'Ana', ativo: true });

    await handler(event({ cpf: CPF_VALIDO }), contexto('homolog'));

    expect(findCliente).toHaveBeenCalledWith(
      CPF_VALIDO,
      'homolog',
      expect.stringContaining('oficina_homolog'),
    );
  });

  // Antes, os dois aliases liam a mesma DATABASE_URL da versão publicada:
  // /homolog/auth/cpf autenticava clientes que só existiam em produção.
  it('não usa o banco de produção quando invocado pelo alias homolog', async () => {
    findCliente.mockResolvedValue({ id: 'cliente-1', nome: 'Ana', ativo: true });

    await handler(event({ cpf: CPF_VALIDO }), contexto('homolog'));

    expect(findCliente).not.toHaveBeenCalledWith(
      CPF_VALIDO,
      expect.anything(),
      expect.stringContaining('oficina_prod'),
    );
  });

  it('devolve 500 sem tocar no banco quando a invocação não passa por alias', async () => {
    const semAlias = {
      awsRequestId: 'ctx-request-id',
      invokedFunctionArn:
        'arn:aws:lambda:us-east-1:123456789012:function:oficina-auth-cpf',
    } as unknown as Context;

    const response = await handler(event({ cpf: CPF_VALIDO }), semAlias);

    expect(response.statusCode).toBe(500);
    expect(findCliente).not.toHaveBeenCalled();
  });
});
