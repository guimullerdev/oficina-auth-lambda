import jwt from 'jsonwebtoken';
import type { APIGatewayProxyEvent } from 'aws-lambda';

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

beforeEach(() => {
  jest.clearAllMocks();
  process.env.JWT_SECRET = SECRET;
});

describe('handler — caminho feliz', () => {
  it('devolve JWT assinado com as claims do cliente', async () => {
    findCliente.mockResolvedValue({ id: 'cliente-1', nome: 'Ana', ativo: true });

    const response = await handler(event({ cpf: '529.982.247-25' }));

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

    await handler(event({ cpf: '529.982.247-25' }));

    expect(findCliente).toHaveBeenCalledWith(CPF_VALIDO);
  });
});

describe('handler — recusas', () => {
  it('400 quando o CPF é inválido, sem tocar no banco', async () => {
    const response = await handler(event({ cpf: '11111111111' }));

    expect(response.statusCode).toBe(400);
    expect(findCliente).not.toHaveBeenCalled();
  });

  it('400 quando falta o campo cpf', async () => {
    expect((await handler(event({}))).statusCode).toBe(400);
  });

  it('400 quando o body não é JSON', async () => {
    expect((await handler(event('não é json'))).statusCode).toBe(400);
  });

  it('404 quando o cliente não existe', async () => {
    findCliente.mockResolvedValue(null);
    expect((await handler(event({ cpf: CPF_VALIDO }))).statusCode).toBe(404);
  });

  it('403 quando o cliente está inativo', async () => {
    findCliente.mockResolvedValue({ id: 'cliente-2', nome: 'Bruno', ativo: false });

    const response = await handler(event({ cpf: CPF_VALIDO }));

    expect(response.statusCode).toBe(403);
    expect(response.body).not.toContain('accessToken');
  });

  it('500 quando o banco falha', async () => {
    findCliente.mockRejectedValue(new Error('connection timeout'));
    expect((await handler(event({ cpf: CPF_VALIDO }))).statusCode).toBe(500);
  });
});

describe('handler — correlação de requisições', () => {
  it('propaga o x-request-id recebido', async () => {
    findCliente.mockResolvedValue({ id: 'cliente-1', nome: 'Ana', ativo: true });

    const response = await handler(
      event({ cpf: CPF_VALIDO }, { 'x-request-id': 'req-123' }),
    );

    expect(response.headers?.['x-request-id']).toBe('req-123');
  });

  it('gera um correlation-id quando não vem no header', async () => {
    findCliente.mockResolvedValue({ id: 'cliente-1', nome: 'Ana', ativo: true });

    const response = await handler(event({ cpf: CPF_VALIDO }));

    expect(response.headers?.['x-request-id']).toEqual(expect.any(String));
  });
});
