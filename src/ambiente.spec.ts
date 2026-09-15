import { resolverAmbiente, resolverConexao } from './ambiente';

const ARN_BASE = 'arn:aws:lambda:us-east-1:123456789012:function:oficina-auth-cpf';

describe('resolverAmbiente', () => {
  it('extrai o alias do ARN invocado', () => {
    expect(resolverAmbiente(`${ARN_BASE}:prod`)).toBe('prod');
    expect(resolverAmbiente(`${ARN_BASE}:homolog`)).toBe('homolog');
  });

  it('devolve undefined para ARN sem alias', () => {
    expect(resolverAmbiente(ARN_BASE)).toBeUndefined();
  });

  it('devolve undefined quando não vem ARN nenhum', () => {
    expect(resolverAmbiente(undefined)).toBeUndefined();
  });
});

describe('resolverConexao', () => {
  const ORIGINAL = process.env;

  beforeEach(() => {
    process.env = {
      ...ORIGINAL,
      DATABASE_URL_PROD: 'postgresql://u:p@host:5432/oficina_prod',
      DATABASE_URL_HOMOLOG: 'postgresql://u:p@host:5432/oficina_homolog',
    };
  });

  afterAll(() => {
    process.env = ORIGINAL;
  });

  // O ponto do exercício: variável de ambiente pertence à versão publicada,
  // e os dois aliases apontam para a mesma. Sem escolher pelo alias, homolog
  // e prod leriam o mesmo banco — foi o que aconteceu no primeiro deploy.
  it('cada alias resolve para o seu próprio database', () => {
    expect(resolverConexao(`${ARN_BASE}:prod`)).toEqual({
      ambiente: 'prod',
      databaseUrl: 'postgresql://u:p@host:5432/oficina_prod',
    });

    expect(resolverConexao(`${ARN_BASE}:homolog`)).toEqual({
      ambiente: 'homolog',
      databaseUrl: 'postgresql://u:p@host:5432/oficina_homolog',
    });
  });

  // Falha fechado: qualquer default escolheria entre servir homologação com
  // dados de produção ou o contrário.
  it('falha quando a invocação não passa por alias', () => {
    expect(() => resolverConexao(ARN_BASE)).toThrow(/sem alias/i);
  });

  it('falha quando o ambiente não tem configuração', () => {
    expect(() => resolverConexao(`${ARN_BASE}:staging`)).toThrow(
      /DATABASE_URL_STAGING/,
    );
  });

  it('não cai em produção por engano quando o alias é desconhecido', () => {
    expect(() => resolverConexao(`${ARN_BASE}:qualquer`)).toThrow();
  });
});
