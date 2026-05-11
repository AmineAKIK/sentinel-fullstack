import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { WORKSHOP_AUTH_COOKIE, setAuthCookie, clearAuthCookie } from '../../auth/authCookies';
import {
  sendInvalidServerConfig,
  sendUnauthenticated,
} from '../../auth/authResponses';
import { signAuthToken } from '../../auth/jwt';
import { sendError } from '../../utils/errors';
import {
  findActiveWorkshopUserByBadge,
  findActiveWorkshopUserBySession,
  setWorkshopUserPassword,
} from './workshopAuth.repository';

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

    const token = signAuthToken(
      {
        userId: user.id,
        badgeNumber: user.badge_number,
        role: user.role,
      }
    );
    if (!token) {
      sendInvalidServerConfig(res);
      return;
    }

    setAuthCookie(res, WORKSHOP_AUTH_COOKIE, token);
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
  clearAuthCookie(res, WORKSHOP_AUTH_COOKIE);
  res.json({ message: 'Déconnecté.' });
}

export async function me(req: Request, res: Response): Promise<void> {
  if (!req.workshopUser) {
    sendUnauthenticated(res);
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
