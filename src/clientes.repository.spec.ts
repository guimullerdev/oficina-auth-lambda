import { stripSslMode } from './clientes.repository';

describe('stripSslMode', () => {
  // O `pg` deixa o que vem parseado da connectionString sobrescrever o config
  // explícito: um sslmode na URL vira `ssl: {}` e apaga o bundle de CAs do
  // RDS, derrubando o handshake com "self-signed certificate in certificate
  // chain". Foi exatamente o que aconteceu no primeiro deploy na AWS.
  it('remove sslmode da URL', () => {
    const url = stripSslMode(
      'postgresql://user:pass@host:5432/oficina_prod?sslmode=require',
    );

    expect(url).not.toContain('sslmode');
  });

  it('preserva host, porta, credenciais e database', () => {
    const url = new URL(
      stripSslMode(
        'postgresql://user:pass@host.rds.amazonaws.com:5432/oficina_prod?sslmode=require',
      ),
    );

    expect(url.hostname).toBe('host.rds.amazonaws.com');
    expect(url.port).toBe('5432');
    expect(url.username).toBe('user');
    expect(url.password).toBe('pass');
    expect(url.pathname).toBe('/oficina_prod');
  });

  it('preserva os demais parâmetros de query', () => {
    const url = stripSslMode(
      'postgresql://user:pass@host:5432/db?sslmode=require&application_name=auth',
    );

    expect(url).toContain('application_name=auth');
  });

  it('é idempotente em URL que já não tem sslmode', () => {
    const original = 'postgresql://user:pass@host:5432/db';

    expect(stripSslMode(original)).toBe(`${original}`);
  });
});
