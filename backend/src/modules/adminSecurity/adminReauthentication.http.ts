import { Response } from 'express';
import { ADMIN_AUTH_COOKIE, clearAuthCookie } from '../../auth/authCookies';
import { sendUnauthenticated } from '../../auth/authResponses';
import { sendError } from '../../utils/errors';
import type { AdminReauthenticationResult } from './adminReauthentication.service';

type FailureReason = Extract<AdminReauthenticationResult, { ok: false }>['reason'];

export function sendAdminReauthenticationFailure(res: Response, reason: FailureReason): void {
  if (reason === 'ACCOUNT_MISSING') {
    sendUnauthenticated(res);
    return;
  }
  if (reason === 'SESSION_REVOKED') {
    clearAuthCookie(res, ADMIN_AUTH_COOKIE);
    sendError(res, 401, 'SESSION_REVOKED', 'Session révoquée après cinq tentatives incorrectes.');
    return;
  }
  sendError(res, 401, 'REAUTHENTICATION_FAILED', 'Mot de passe incorrect.');
}
