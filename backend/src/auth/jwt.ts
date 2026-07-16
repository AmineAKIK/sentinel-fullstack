import jwt from 'jsonwebtoken';
import type { AuthScope } from './sessionPayloads';

const JWT_ISSUER = 'sentinel';

export function getJwtSecret(): string | null {
  const secret = process.env.JWT_SECRET || null;
  if (secret !== null && secret.length === 0) return null;
  return secret;
}

export function signAuthToken(
  payload: object,
  durationHours: number | 'unlimited',
  scope: AuthScope
): string | null {
  const secret = getJwtSecret();
  if (!secret) return null;
  const options: jwt.SignOptions = {
    algorithm: 'HS256',
    issuer: JWT_ISSUER,
    audience: scope,
  };
  if (durationHours === 'unlimited') {
    return jwt.sign({ ...payload, scope }, secret, options);
  }
  return jwt.sign({ ...payload, scope }, secret, {
    ...options,
    expiresIn: durationHours * 3600,
  });
}

export function verifyAuthToken(token: string, scope: AuthScope): unknown | null {
  const secret = getJwtSecret();
  if (!secret) return null;
  return jwt.verify(token, secret, {
    algorithms: ['HS256'],
    issuer: JWT_ISSUER,
    audience: scope,
  });
}

export function isJwtSessionError(err: unknown): boolean {
  return err instanceof jwt.JsonWebTokenError || err instanceof jwt.TokenExpiredError;
}
