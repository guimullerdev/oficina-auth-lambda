import jwt from 'jsonwebtoken';

export interface ClienteTokenPayload {
  sub: string;
  documento: string;
  role: 'CLIENTE';
}

// Mesmo JWT_SECRET e mesmo algoritmo (HS256) que a app usa em
// JwtAuthGuard.verifyAsync — é isso que faz o token emitido aqui ser aceito
// lá sem nenhuma chamada de rede entre os dois (ver ADR 0001).
export function signClienteToken(
  clienteId: string,
  documento: string,
): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET não configurado');

  const payload: ClienteTokenPayload = {
    sub: clienteId,
    documento,
    role: 'CLIENTE',
  };

  return jwt.sign(payload, secret, {
    expiresIn: process.env.JWT_EXPIRES_IN ?? '1h',
  } as jwt.SignOptions);
}
