import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../../db/pool';
import { sendError } from '../../utils/errors';

const COOKIE_NAME = 'sentinel_workshop_token';
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 8 * 60 * 60 * 1000,
};

export async function login(req: Request, res: Response): Promise<void> {
  const { badgeNumber, password, newPassword } = req.body;

  if (!badgeNumber || typeof badgeNumber !== 'string') {
    sendError(res, 400, 'VALIDATION_ERROR', 'Numéro de badge requis.');
    return;
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, first_name, last_name, badge_number, role, password_hash
       FROM sentinel_users
       WHERE badge_number = $1 AND is_active = TRUE AND is_deleted = FALSE`,
      [badgeNumber.trim()]
    );

    if (rows.length === 0) {
      sendError(res, 401, 'UNAUTHORIZED', 'Badge invalide ou utilisateur inactif.');
      return;
    }

    const user = rows[0];

    if (!user.password_hash) {
      if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
        res.status(200).json({
          requiresPasswordSetup: true,
          badge_number: user.badge_number,
        });
        return;
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);
      await pool.query(
        'UPDATE sentinel_users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
        [passwordHash, user.id]
      );
    } else {
      if (!password || typeof password !== 'string') {
        res.status(200).json({
          requiresPassword: true,
          badge_number: user.badge_number,
        });
        return;
      }

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        sendError(res, 401, 'UNAUTHORIZED', 'Badge ou mot de passe incorrect.');
        return;
      }
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      sendError(res, 500, 'SERVER_ERROR', 'Configuration du serveur invalide.');
      return;
    }

    const token = jwt.sign(
      {
        userId: user.id,
        badgeNumber: user.badge_number,
        role: user.role,
      },
      secret,
      { expiresIn: '8h' }
    );

    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
    res.json({
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      badge_number: user.badge_number,
      role: user.role,
    });
  } catch (err) {
    console.error('Workshop login error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function logout(_req: Request, res: Response): Promise<void> {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  res.json({ message: 'Déconnecté.' });
}

export async function me(req: Request, res: Response): Promise<void> {
  if (!req.workshopUser) {
    sendError(res, 401, 'UNAUTHORIZED', 'Non authentifié.');
    return;
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, first_name, last_name, badge_number, role
       FROM sentinel_users
       WHERE id = $1 AND badge_number = $2 AND is_active = TRUE AND is_deleted = FALSE`,
      [req.workshopUser.userId, req.workshopUser.badgeNumber]
    );

    if (rows.length === 0) {
      sendError(res, 401, 'UNAUTHORIZED', 'Utilisateur inactif ou introuvable.');
      return;
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('Workshop me error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}
