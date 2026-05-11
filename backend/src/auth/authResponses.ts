import { Response } from 'express';
import { sendError } from '../utils/errors';

export function sendMissingAuth(res: Response): void {
  sendError(res, 401, 'UNAUTHORIZED', 'Authentification requise.');
}

export function sendInvalidSession(res: Response): void {
  sendError(res, 401, 'UNAUTHORIZED', 'Session invalide ou expirée.');
}

export function sendUnauthenticated(res: Response): void {
  sendError(res, 401, 'UNAUTHORIZED', 'Non authentifié.');
}

export function sendInvalidServerConfig(res: Response): void {
  sendError(res, 500, 'SERVER_ERROR', 'Configuration du serveur invalide.');
}
