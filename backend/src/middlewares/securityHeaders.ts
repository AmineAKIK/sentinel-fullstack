import { NextFunction, Request, Response } from 'express';
import { BASE_SECURITY_HEADERS, STRICT_TRANSPORT_SECURITY } from './securityHeaderPolicy';

const NON_CACHEABLE_API_PREFIXES = ['/api/auth', '/api/admin', '/api/workshop', '/api/board'];

function isNonCacheableApiPath(path: string): boolean {
  return NON_CACHEABLE_API_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );
}

export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  // Valeurs canoniques uniques (cf. securityHeaderPolicy) : le Nginx frontend
  // pose les mêmes sur les réponses statiques, sans jamais les dupliquer.
  for (const [name, value] of BASE_SECURITY_HEADERS) {
    res.setHeader(name, value);
  }
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', STRICT_TRANSPORT_SECURITY);
  }
  if (isNonCacheableApiPath(req.path)) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
}
