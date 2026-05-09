import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { sendError } from '../../utils/errors';
import {
  findActiveWorkshopUserByBadge,
  findActiveWorkshopUserBySession,
  setWorkshopUserPassword,
} from './workshopAuth.repository';

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
    const user = await findActiveWorkshopUserByBadge(badgeNumber);
    if (!user) {
      sendError(res, 401, 'UNAUTHORIZED', 'Badge invalide ou utilisateur inactif.');
      return;
    }

    if (!user.password_hash) {
      if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
        res.status(200).json({
          requiresPasswordSetup: true,
          badge_number: user.badge_number,
        });
        return;
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);
      await setWorkshopUserPassword(user.id, passwordHash);
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
    const user = await findActiveWorkshopUserBySession({
      userId: req.workshopUser.userId,
      badgeNumber: req.workshopUser.badgeNumber,
    });
    if (!user) {
      sendError(res, 401, 'UNAUTHORIZED', 'Utilisateur inactif ou introuvable.');
      return;
    }

    res.json(user);
  } catch (err) {
    console.error('Workshop me error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}
