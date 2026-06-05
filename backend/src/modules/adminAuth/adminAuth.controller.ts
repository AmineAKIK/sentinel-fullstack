import { Request, Response } from 'express';
import {
  hashAdminPassword,
  MIN_PASSWORD_LENGTH_ADMIN,
  verifyPassword as verifyPwd,
} from '../../auth/bcrypt';
import { ADMIN_AUTH_COOKIE, clearAuthCookie, setAuthCookie } from '../../auth/authCookies';
import {
  sendInvalidServerConfig,
  sendUnauthenticated,
} from '../../auth/authResponses';
import { signAuthToken } from '../../auth/jwt';
import { sendError } from '../../utils/errors';
import { handleControllerError } from '../../utils/controller';
import { findAdminByUsername, getAdminPasswordHash, updateAdminPasswordHash } from './adminAuth.repository';

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

export async function login(req: Request, res: Response): Promise<void> {
  const { username, password } = req.body;

  if (!username || !password) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Identifiant et mot de passe requis.');
    return;
  }

  try {
    const admin = await findAdminByUsername(username);
    if (!admin) {
      sendError(res, 401, 'UNAUTHORIZED', 'Identifiants incorrects.');
      return;
    }

    const valid = await verifyPwd(password, admin.password_hash);
    if (!valid) {
      sendError(res, 401, 'UNAUTHORIZED', 'Identifiants incorrects.');
      return;
    }

    const token = signAuthToken({ adminId: admin.id, username: admin.username });
    if (!token) {
      sendInvalidServerConfig(res);
      return;
    }

    setAuthCookie(res, ADMIN_AUTH_COOKIE, token);
    res.json({ id: admin.id, username: admin.username });
  } catch (err) {
    handleControllerError(res, 'adminLogin', err);
  }
}

export async function me(req: Request, res: Response): Promise<void> {
  if (!req.admin) {
    sendUnauthenticated(res);
    return;
  }
  res.json({ id: req.admin.adminId, username: req.admin.username });
}

export async function logout(_req: Request, res: Response): Promise<void> {
  clearAuthCookie(res, ADMIN_AUTH_COOKIE);
  res.json({ message: 'Déconnecté.' });
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
