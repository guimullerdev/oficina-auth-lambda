import { Pool } from 'pg';

// Bundle de CAs da AWS para RDS, embutido no artefato pelo esbuild
// (--loader:.pem=text). O certificado do RDS é assinado por uma CA da
// Amazon que não está no trust store padrão do Node — sem isso o handshake
// falha com "self-signed certificate in certificate chain".
import rdsCaBundle from '../certs/rds-global-bundle.pem';

export interface Cliente {
  id: string;
  nome: string;
  ativo: boolean;
}

// Pool no escopo do módulo: sobrevive entre invocações enquanto o container
// Lambda estiver quente, evitando abrir conexão nova a cada request.
let pool: Pool | undefined;

// `pg` dá precedência ao que vem parseado da connectionString sobre o config
// explícito (ver connection-parameters.js). Um `sslmode` na URL viraria
// `ssl: {}` e apagaria o bundle de CAs abaixo, então ele sai da URL e quem
// decide o TLS é só o bloco `ssl`.
export function stripSslMode(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  url.searchParams.delete('sslmode');
  return url.toString();
}

function getPool(): Pool {
  if (!pool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL não configurada');
    }

    pool = new Pool({
      connectionString: stripSslMode(databaseUrl),
      // rejectUnauthorized fica no default (true): com a CA correta em mãos
      // não há motivo para abrir mão da validação de cadeia e de hostname.
      ssl: { ca: rdsCaBundle },
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
