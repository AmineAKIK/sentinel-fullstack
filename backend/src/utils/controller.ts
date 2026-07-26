import { Response } from 'express';
import { ZodError } from 'zod';
import { sendError } from './errors';
import { ServiceResult } from './serviceResult';
import logger from '../logger';
import { isPostgresError } from './postgresError';

export function formatZodError(err: ZodError): string {
  return err.errors.map((e) => e.message).join(' ');
}

export function sendServiceError<T>(
  res: Response,
  result: ServiceResult<T>
): result is Extract<ServiceResult<T>, { ok: false }> {
  if (result.ok) return false;
  sendError(res, result.status, result.code, result.message, result.details);
  return true;
}

export function parseIdParam(value: string): ServiceResult<number> {
  if (!/^[1-9]\d*$/.test(value)) {
    return { ok: false, status: 400, code: 'VALIDATION_ERROR', message: 'Identifiant invalide.' };
  }

  const id = Number(value);
  if (!Number.isSafeInteger(id)) {
    return { ok: false, status: 400, code: 'VALIDATION_ERROR', message: 'Identifiant invalide.' };
  }

  return { ok: true, data: id };
}

export function handleControllerError(res: Response, label: string, err: unknown): void {
  logger.error({ err, label }, 'Controller error');
  if (isPostgresError(err)) {
    if (err.code === '23505' || err.code === '23503') {
      sendError(
        res,
        409,
        'CONFLICT',
        "L'opération entre en conflit avec une donnée existante ou encore utilisée."
      );
      return;
    }
    if (err.code === '23514' || err.code === '22001' || err.code === '22P02') {
      sendError(res, 400, 'VALIDATION_ERROR', 'La donnée fournie ne respecte pas les contraintes.');
      return;
    }
  }
  sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
}
