import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/errors';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  windowMs: number;
  maxAttempts: number;
  // When true, key is IP-only (no identity). Used for global API limiting.
  ipOnly?: boolean;
}

function createRateLimit(options: RateLimitOptions) {
  const { windowMs, maxAttempts, ipOnly = false } = options;
  const attempts = new Map<string, RateLimitEntry>();
  let lastCleanupAt = 0;

  function cleanup(now: number): void {
    if (now - lastCleanupAt < windowMs) return;
    lastCleanupAt = now;
    for (const [key, entry] of attempts.entries()) {
      if (now > entry.resetAt) attempts.delete(key);
    }
  }

  function getKey(req: Request): string {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    if (ipOnly) return ip;

    const identity =
      typeof req.body?.username === 'string'
        ? req.body.username.trim().toLowerCase()
        : typeof req.body?.badgeNumber === 'string'
          ? req.body.badgeNumber.trim().toLowerCase()
          : 'unknown';
    return `${req.method}:${req.baseUrl || req.path}:${ip}:${identity}`;
  }

  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
    const now = Date.now();
    cleanup(now);

    const key = getKey(req);
    const entry = attempts.get(key);

    if (!entry || now > entry.resetAt) {
      attempts.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    entry.count += 1;

    if (entry.count > maxAttempts) {
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
  };
}

// Strict limiter for login endpoints: keyed by IP + identity, 20 attempts / 15 min
export const loginRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000,
  maxAttempts: 20,
});

// Global API limiter: keyed by IP only, 300 requests / 15 min
// Protects against runaway clients and basic DoS at the application layer.
export const globalApiRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000,
  maxAttempts: 300,
  ipOnly: true,
});
