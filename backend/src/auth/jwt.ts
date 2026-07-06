import jwt from 'jsonwebtoken';

export function getJwtSecret(): string | null {
  const secret = process.env.JWT_SECRET || null;
  if (secret !== null && secret.length === 0) return null;
  return secret;
}

export function signAuthToken(payload: object, durationHours: number | 'unlimited'): string | null {
  const secret = getJwtSecret();
  if (!secret) return null;
  if (durationHours === 'unlimited') {
    return jwt.sign(payload, secret);
  }
  return jwt.sign(payload, secret, { expiresIn: durationHours * 3600 });
}

export function verifyAuthToken<TPayload>(token: string): TPayload | null {
  const secret = getJwtSecret();
  if (!secret) return null;
  return jwt.verify(token, secret) as TPayload;
}

export function isJwtSessionError(err: unknown): boolean {
  return err instanceof jwt.JsonWebTokenError || err instanceof jwt.TokenExpiredError;
}
