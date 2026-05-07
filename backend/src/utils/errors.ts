import { Response } from 'express';

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'BADGE_ALREADY_EXISTS'
  | 'LINE_ALREADY_EXISTS'
  | 'MACHINE_ALREADY_EXISTS'
  | 'SERVER_ERROR';

export interface ApiError {
  error: {
    code: ErrorCode;
    message: string;
  };
}

export function sendError(
  res: Response,
  status: number,
  code: ErrorCode,
  message: string
): void {
  res.status(status).json({ error: { code, message } });
}
