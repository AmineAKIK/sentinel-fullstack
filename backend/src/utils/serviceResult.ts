import { ErrorCode, ErrorDetails } from './errors';

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: ErrorCode; message: string; details?: ErrorDetails };

export function ok<T>(data: T): ServiceResult<T> {
  return { ok: true, data };
}

export function serviceError(
  status: number,
  code: ErrorCode,
  message: string,
  details?: ErrorDetails
): ServiceResult<never> {
  return { ok: false, status, code, message, ...(details ? { details } : {}) };
}

export function badRequest(message: string, details?: ErrorDetails): ServiceResult<never> {
  return serviceError(400, 'VALIDATION_ERROR', message, details);
}

export function forbidden(message: string): ServiceResult<never> {
  return serviceError(403, 'FORBIDDEN', message);
}

export function notFound(message: string): ServiceResult<never> {
  return serviceError(404, 'NOT_FOUND', message);
}

export function conflict(code: ErrorCode, message: string): ServiceResult<never> {
  return serviceError(409, code, message);
}
