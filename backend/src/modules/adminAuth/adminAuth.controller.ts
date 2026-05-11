import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { ADMIN_AUTH_COOKIE, clearAuthCookie, setAuthCookie } from '../../auth/authCookies';
import {
  sendInvalidServerConfig,
  sendUnauthenticated,
} from '../../auth/authResponses';
import { signAuthToken } from '../../auth/jwt';
import { sendError } from '../../utils/errors';
import { findAdminByUsername, getAdminPasswordHash } from './adminAuth.repository';

const verifyFailures = new Map<number, number>();

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

    const valid = await bcrypt.compare(password, admin.password_hash);

    if (!valid) {
      sendError(res, 401, 'UNAUTHORIZED', 'Identifiants incorrects.');
      return;
    }

    const token = signAuthToken(
      { adminId: admin.id, username: admin.username },
    );
    if (!token) {
      sendInvalidServerConfig(res);
      return;
    }

    setAuthCookie(res, ADMIN_AUTH_COOKIE, token);
    res.json({ id: admin.id, username: admin.username });
  } catch (err) {
    console.error('Login error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
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

    const valid = await bcrypt.compare(password, passwordHash);
    if (!valid) {
      const attempts = (verifyFailures.get(req.admin.adminId) || 0) + 1;
      verifyFailures.set(req.admin.adminId, attempts);
      if (attempts >= 3) {
        verifyFailures.delete(req.admin.adminId);
        clearAuthCookie(res, ADMIN_AUTH_COOKIE);
        sendError(res, 401, 'UNAUTHORIZED', 'Session expirée.');
        return;
      }
      sendError(res, 401, 'UNAUTHORIZED', 'Mot de passe incorrect.');
      return;
    }

    verifyFailures.delete(req.admin.adminId);

    res.json({ valid: true });
  } catch (err) {
    console.error('verifyPassword error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}
