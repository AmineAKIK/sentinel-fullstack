import { Response } from 'express';

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'REAUTHENTICATION_FAILED'
  | 'SESSION_REVOKED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'BADGE_ALREADY_EXISTS'
  | 'LINE_ALREADY_EXISTS'
  | 'MACHINE_ALREADY_EXISTS'
  | 'RESOURCE_IN_USE'
  | 'LINE_HAS_ACTIVE_INCIDENTS'
  | 'ARBITRATION_REQUIRED'
  | 'ARBITRATION_ALREADY_PENDING'
  | 'NO_CHANGES'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'SERVICE_UNAVAILABLE';

export interface ApiError {
  error: {
    code: ErrorCode;
    message: string;
  };
}

export function sendError(res: Response, status: number, code: ErrorCode, message: string): void {
  res.status(status).json({ error: { code, message } });
}
