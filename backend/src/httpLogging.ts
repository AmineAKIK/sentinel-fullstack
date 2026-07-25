import type { Options } from 'pino-http';
import type { ServerResponse } from 'http';
import type { IncomingMessage } from 'http';

// Chemins masqués par Pino dans les journaux HTTP. Couvre les secrets entrants
// (cookie et autorisation de la requête) ET sortants : `res.headers["set-cookie"]`
// transporte le jeton de session signé, qui fuitait en clair avant ce correctif.
// La syntaxe entre crochets est requise pour les clés contenant un tiret.
export const HTTP_LOG_REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
] as const;

export function httpLoggingOptions(logger: Options['logger']): Options {
  return {
    logger,
    // 5xx en error, 4xx en warn, le reste en info.
    customLogLevel: (_req: IncomingMessage, res: ServerResponse, err?: Error) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    redact: [...HTTP_LOG_REDACT_PATHS],
  };
}
