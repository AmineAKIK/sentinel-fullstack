import type { ErrorRequestHandler, RequestHandler } from 'express';
import logger from '../logger';
import { sendError } from '../utils/errors';

interface HttpBodyError {
  status?: unknown;
  type?: unknown;
}

export const apiNotFoundHandler: RequestHandler = (_req, res) => {
  sendError(res, 404, 'NOT_FOUND', 'Route API introuvable.');
};

export const apiErrorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (res.headersSent) {
    _next(error);
    return;
  }

  const candidate = error as HttpBodyError;

  if (candidate.type === 'entity.parse.failed') {
    sendError(res, 400, 'VALIDATION_ERROR', 'Corps JSON invalide.');
    return;
  }

  if (candidate.type === 'entity.too.large' || candidate.status === 413) {
    sendError(res, 413, 'VALIDATION_ERROR', 'Corps de requête trop volumineux.');
    return;
  }

  logger.error({ err: error }, 'Unhandled API error');
  sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
};
