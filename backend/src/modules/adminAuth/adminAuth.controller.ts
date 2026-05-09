import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { sendError } from '../../utils/errors';
import { findAdminByUsername, getAdminPasswordHash } from './adminAuth.repository';

const COOKIE_NAME = 'sentinel_admin_token';
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 8 * 60 * 60 * 1000, // 8 hours
};

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

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      sendError(res, 500, 'SERVER_ERROR', 'Configuration du serveur invalide.');
      return;
    }

    const token = jwt.sign(
      { adminId: admin.id, username: admin.username },
      secret,
      { expiresIn: '8h' }
    );

    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
    res.json({ id: admin.id, username: admin.username });
  } catch (err) {
    console.error('Login error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function me(req: Request, res: Response): Promise<void> {
  if (!req.admin) {
    sendError(res, 401, 'UNAUTHORIZED', 'Non authentifié.');
    return;
  }
  res.json({ id: req.admin.adminId, username: req.admin.username });
}

export async function logout(_req: Request, res: Response): Promise<void> {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  res.json({ message: 'Déconnecté.' });
}

export async function verifyPassword(req: Request, res: Response): Promise<void> {
  if (!req.admin) {
    sendError(res, 401, 'UNAUTHORIZED', 'Non authentifié.');
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
        res.clearCookie(COOKIE_NAME, {
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
        });
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
