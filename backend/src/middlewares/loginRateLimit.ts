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

interface RateLimiter {
  middleware: (req: Request, res: Response, next: NextFunction) => void;
  // Enregistre une tentative ratée pour la clé de la requête (login échoué).
  recordFailure: (req: Request) => void;
  // Efface le compteur (login réussi) : un bon identifiant repart de zéro.
  clear: (req: Request) => void;
}

function createRateLimit(options: RateLimitOptions): RateLimiter {
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

    // Le login unifié envoie le champ `identifier` (username admin OU badge
    // atelier). On garde une compatibilité avec username/badgeNumber au cas où
    // d'autres routes réutiliseraient ce limiteur.
    const raw =
      (typeof req.body?.identifier === 'string' && req.body.identifier) ||
      (typeof req.body?.username === 'string' && req.body.username) ||
      (typeof req.body?.badgeNumber === 'string' && req.body.badgeNumber) ||
      'unknown';
    const identity = raw.trim().toLowerCase() || 'unknown';
    return `${req.method}:${req.baseUrl || req.path}:${ip}:${identity}`;
  }

  function middleware(req: Request, res: Response, next: NextFunction): void {
    const now = Date.now();
    cleanup(now);

    const entry = attempts.get(getKey(req));

    // On ne fait que VÉRIFIER ici. L'incrément n'a lieu qu'en cas d'échec
    // avéré, signalé par le contrôleur via recordFailure — un login réussi ne
    // doit jamais consommer le quota.
    if (entry && now <= entry.resetAt && entry.count >= maxAttempts) {
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

  function recordFailure(req: Request): void {
    const now = Date.now();
    const key = getKey(req);
    const entry = attempts.get(key);
    if (!entry || now > entry.resetAt) {
      attempts.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }
    entry.count += 1;
  }

  function clear(req: Request): void {
    attempts.delete(getKey(req));
  }

  return { middleware, recordFailure, clear };
}

// Limiteur de connexion : clé IP + identité, ne compte que les échecs.
// 10 échecs / 5 min — adapté à un atelier où plusieurs personnes partagent un
// poste (même IP) et peuvent se tromper puis se reconnecter rapidement.
export const loginLimiter = createRateLimit({
  windowMs: 5 * 60 * 1000,
  maxAttempts: 10,
});

export const loginRateLimit = loginLimiter.middleware;

// Limiteur global d'API : clé IP seule, 300 requêtes / 15 min.
// Protège contre un client emballé / un DoS basique au niveau applicatif.
// Conserve le comportement « incrémente à chaque requête » via recordFailure
// appelé sur le passage (cf. middleware ci-dessous).
const globalLimiter = createRateLimit({
  windowMs: 15 * 60 * 1000,
  maxAttempts: 300,
  ipOnly: true,
});

export function globalApiRateLimit(req: Request, res: Response, next: NextFunction): void {
  // Le limiteur global compte CHAQUE requête (pas seulement les échecs) : on
  // enregistre le passage puis on laisse le middleware vérifier le plafond.
  globalLimiter.recordFailure(req);
  globalLimiter.middleware(req, res, next);
}
