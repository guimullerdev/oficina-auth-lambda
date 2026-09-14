import { Pool } from 'pg';

export interface Cliente {
  id: string;
  nome: string;
  ativo: boolean;
}

// Pool no escopo do módulo: sobrevive entre invocações enquanto o container
// Lambda estiver quente, evitando abrir conexão nova a cada request.
let pool: Pool | undefined;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 1,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return pool;
}

export async function findClienteByDocumento(
  documento: string,
): Promise<Cliente | null> {
  const result = await getPool().query<Cliente>(
    'SELECT id, nome, ativo FROM clientes WHERE documento = $1 LIMIT 1',
    [documento],
  );
  return result.rows[0] ?? null;
}
