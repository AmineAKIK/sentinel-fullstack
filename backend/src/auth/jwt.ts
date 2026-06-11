import jwt from 'jsonwebtoken';
import { SESSION_DURATION_JWT } from './session';

export function getJwtSecret(): string | null {
  const secret = process.env.JWT_SECRET || null;
  if (secret !== null && secret.length === 0) return null;
  return secret;
}

export function signAuthToken(payload: object): string | null {
  const secret = getJwtSecret();
  if (!secret) return null;

  return jwt.sign(payload, secret, { expiresIn: SESSION_DURATION_JWT });
}

export function verifyAuthToken<TPayload>(token: string): TPayload | null {
  const secret = getJwtSecret();
  if (!secret) return null;

  return jwt.verify(token, secret) as TPayload;
}

export function isJwtSessionError(err: unknown): boolean {
  return err instanceof jwt.JsonWebTokenError || err instanceof jwt.TokenExpiredError;
}
