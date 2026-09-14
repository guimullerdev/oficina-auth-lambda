// Logs estruturados em JSON — o CloudWatch/New Relic conseguem indexar campo
// a campo, e o correlationId é o que amarra uma requisição desta Lambda com
// os logs da app (ver ADR 0004).
type Level = 'info' | 'warn' | 'error';

export function log(
  level: Level,
  message: string,
  fields: Record<string, unknown> = {},
): void {
  const entry = {
    level,
    message,
    service: 'oficina-auth-lambda',
    timestamp: new Date().toISOString(),
    ...fields,
  };
  // eslint-disable-next-line no-console
  console[level === 'error' ? 'error' : 'log'](JSON.stringify(entry));
}
