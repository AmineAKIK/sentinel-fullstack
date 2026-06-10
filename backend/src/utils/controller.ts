import { Response } from 'express';
import { ZodError } from 'zod';
import { sendError } from './errors';
import { ServiceResult } from './serviceResult';
import logger from '../logger';

export function formatZodError(err: ZodError): string {
  return err.errors.map((e) => e.message).join(' ');
}

export function sendServiceError<T>(
  res: Response,
  result: ServiceResult<T>
): result is Extract<ServiceResult<T>, { ok: false }> {
  if (result.ok) return false;
  sendError(res, result.status, result.code, result.message);
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
  sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
}
