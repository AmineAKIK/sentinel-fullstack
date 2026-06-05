import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/errors';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 20;

const attempts = new Map<string, RateLimitEntry>();
let lastCleanupAt = 0;

function getClientKey(req: Request): string {
  const identity = typeof req.body?.username === 'string'
    ? req.body.username.trim().toLowerCase()
    : typeof req.body?.badgeNumber === 'string'
      ? req.body.badgeNumber.trim().toLowerCase()
      : 'unknown';
  return `${req.method}:${req.baseUrl || req.path}:${req.ip || req.socket.remoteAddress || 'unknown'}:${identity}`;
}

function cleanupExpiredAttempts(now: number): void {
  if (now - lastCleanupAt < WINDOW_MS) return;
  lastCleanupAt = now;
  for (const [key, entry] of attempts.entries()) {
    if (now > entry.resetAt) attempts.delete(key);
  }
}

export function loginRateLimit(req: Request, res: Response, next: NextFunction): void {
  const now = Date.now();
  cleanupExpiredAttempts(now);

  const key = getClientKey(req);

  const entry = attempts.get(key);

  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    next();
    return;
  }

  entry.count += 1;

  if (entry.count > MAX_ATTEMPTS) {
    const retryAfterSecs = Math.ceil((entry.resetAt - now) / 1000);
    res.setHeader('Retry-After', String(retryAfterSecs));
    sendError(
      res,
      429,
      'RATE_LIMITED',
      `Trop de tentatives. Réessayez dans ${Math.ceil(retryAfterSecs / 60)} minute(s).`
    );
    return;
  }

  next();
}
