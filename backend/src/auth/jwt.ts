import jwt from 'jsonwebtoken';

export function getJwtSecret(): string | null {
  const secret = process.env.JWT_SECRET || null;
  if (secret !== null && secret.length === 0) return null;
  return secret;
}

export function signAuthToken(payload: object, durationHours: number): string | null {
  const secret = getJwtSecret();
  if (!secret) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return jwt.sign(payload, secret, { expiresIn: durationHours * 3600 } as any);
}

export function verifyAuthToken<TPayload>(token: string): TPayload | null {
  const secret = getJwtSecret();
  if (!secret) return null;
  return jwt.verify(token, secret) as TPayload;
}

export function isJwtSessionError(err: unknown): boolean {
  return err instanceof jwt.JsonWebTokenError || err instanceof jwt.TokenExpiredError;
}
