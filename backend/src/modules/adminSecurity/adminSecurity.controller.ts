import { Request, Response } from 'express';
import {
  hashAdminPassword,
  MIN_PASSWORD_LENGTH_ADMIN,
  verifyPassword as verifyPwd,
} from '../../auth/bcrypt';
import { ADMIN_AUTH_COOKIE, clearAuthCookie } from '../../auth/authCookies';
import { sendUnauthenticated } from '../../auth/authResponses';
import { sendError } from '../../utils/errors';
import { handleControllerError } from '../../utils/controller';
import { getAdminPasswordHash, updateAdminPasswordHash } from '../adminCredentials/adminCredentials.repository';

const VERIFY_FAILURE_TTL_MS = 30 * 60 * 1000;
const VERIFY_FAILURE_MAX = 3;

interface VerifyFailureEntry {
  count: number;
  lastAttemptAt: number;
}

const verifyFailures = new Map<number, VerifyFailureEntry>();

function getFailureCount(adminId: number): number {
  const entry = verifyFailures.get(adminId);
  if (!entry) return 0;
  if (Date.now() - entry.lastAttemptAt > VERIFY_FAILURE_TTL_MS) {
    verifyFailures.delete(adminId);
    return 0;
  }
  return entry.count;
}

function incrementFailureCount(adminId: number): number {
  const count = getFailureCount(adminId) + 1;
  verifyFailures.set(adminId, { count, lastAttemptAt: Date.now() });
  return count;
}

export async function changePassword(req: Request, res: Response): Promise<void> {
  if (!req.admin) {
    sendUnauthenticated(res);
    return;
  }

  const { currentPassword, newPassword } = req.body || {};

  if (!currentPassword || typeof currentPassword !== 'string') {
    sendError(res, 400, 'VALIDATION_ERROR', 'Mot de passe actuel requis.');
    return;
  }
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH_ADMIN) {
    sendError(res, 400, 'VALIDATION_ERROR', `Le nouveau mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH_ADMIN} caractères.`);
    return;
  }

  try {
    const passwordHash = await getAdminPasswordHash(req.admin.adminId);
    if (!passwordHash) {
      sendError(res, 401, 'UNAUTHORIZED', 'Non authentifié.');
      return;
    }

    const valid = await verifyPwd(currentPassword, passwordHash);
    if (!valid) {
      sendError(res, 401, 'UNAUTHORIZED', 'Mot de passe actuel incorrect.');
      return;
    }

    const newHash = await hashAdminPassword(newPassword);
    await updateAdminPasswordHash(req.admin.adminId, newHash);

    clearAuthCookie(res, ADMIN_AUTH_COOKIE);
    res.json({ message: 'Mot de passe modifié. Reconnectez-vous.' });
  } catch (err) {
    handleControllerError(res, 'changePassword', err);
  }
}

export async function verifyPassword(req: Request, res: Response): Promise<void> {
  if (!req.admin) {
    sendUnauthenticated(res);
    return;
  }

  const { password } = req.body || {};
  if (!password) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Mot de passe requis.');
    return;
  }

  try {
    const passwordHash = await getAdminPasswordHash(req.admin.adminId);
    if (!passwordHash) {
      sendError(res, 401, 'UNAUTHORIZED', 'Non authentifié.');
      return;
    }

    const valid = await verifyPwd(password, passwordHash);
    if (!valid) {
      const attempts = incrementFailureCount(req.admin.adminId);
      if (attempts >= VERIFY_FAILURE_MAX) {
        verifyFailures.delete(req.admin.adminId);
        clearAuthCookie(res, ADMIN_AUTH_COOKIE);
        sendError(res, 401, 'UNAUTHORIZED', 'Session expirée après trop de tentatives incorrectes.');
        return;
      }
      sendError(res, 401, 'UNAUTHORIZED', 'Mot de passe incorrect.');
      return;
    }

    verifyFailures.delete(req.admin.adminId);
    res.json({ valid: true });
  } catch (err) {
    handleControllerError(res, 'verifyPassword', err);
  }
}
