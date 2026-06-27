import { Router, Request, Response, NextFunction } from 'express';
import { sendError } from '../../utils/errors';
import { requestPasswordReset } from './passwordReset.controller';

const router = Router();

// Rate limit dédié : 5 requêtes / 15 min par IP — route publique sensible
const WINDOW_MS = 15 * 60 * 1000;
const MAX = 5;
const attempts = new Map<string, { count: number; resetAt: number }>();

function resetRateLimit(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = attempts.get(ip);

  if (entry && now <= entry.resetAt) {
    if (entry.count >= MAX) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      sendError(res, 429, 'RATE_LIMITED', `Trop de tentatives. Réessayez dans ${Math.ceil(retryAfter / 60)} minute(s).`);
      return;
    }
    entry.count += 1;
  } else {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  }

  next();
}

router.post('/request', resetRateLimit, requestPasswordReset);

export default router;
