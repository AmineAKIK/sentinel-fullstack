import { Request, Response } from 'express';
import { WORKSHOP_AUTH_COOKIE, setAuthCookie, clearAuthCookie } from '../../auth/authCookies';
import {
  sendInvalidServerConfig,
  sendUnauthenticated,
} from '../../auth/authResponses';
import { signAuthToken } from '../../auth/jwt';
import { sendError } from '../../utils/errors';
import { handleControllerError } from '../../utils/controller';
import { findActiveWorkshopUserBySession } from './workshopAuth.repository';
import { loginWorkshopUserService } from './workshopAuth.service';

export async function login(req: Request, res: Response): Promise<void> {
  const { badgeNumber, password, newPassword, setupCode } = req.body;

  if (!badgeNumber || typeof badgeNumber !== 'string') {
    sendError(res, 400, 'VALIDATION_ERROR', 'Numéro de badge requis.');
    return;
  }

  try {
    const result = await loginWorkshopUserService(badgeNumber, password, newPassword, setupCode);

    if (result.kind === 'invalid_badge') {
      sendError(res, 401, 'UNAUTHORIZED', 'Badge invalide ou utilisateur inactif.');
      return;
    }

    if (result.kind === 'requires_password_setup') {
      res.status(200).json({ requiresPasswordSetup: true, badge_number: result.badgeNumber });
      return;
    }

    if (result.kind === 'invalid_setup_code') {
      sendError(res, 401, 'UNAUTHORIZED', 'Code temporaire incorrect.');
      return;
    }

    if (result.kind === 'expired_setup_code') {
      sendError(res, 401, 'UNAUTHORIZED', 'Code temporaire expiré ou absent. Demandez une réinitialisation à l’administrateur.');
      return;
    }

    if (result.kind === 'requires_password') {
      res.status(200).json({ requiresPassword: true, badge_number: result.badgeNumber });
      return;
    }

    if (result.kind === 'invalid_password') {
      sendError(res, 401, 'UNAUTHORIZED', 'Badge ou mot de passe incorrect.');
      return;
    }

    const token = signAuthToken({
      userId: result.user.id,
      badgeNumber: result.user.badge_number,
      role: result.user.role,
    });
    if (!token) {
      sendInvalidServerConfig(res);
      return;
    }

    setAuthCookie(res, WORKSHOP_AUTH_COOKIE, token);
    res.json({
      id: result.user.id,
      first_name: result.user.first_name,
      last_name: result.user.last_name,
      badge_number: result.user.badge_number,
      role: result.user.role,
    });
  } catch (err) {
    handleControllerError(res, 'workshopLogin', err);
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
    handleControllerError(res, 'workshopMe', err);
  }
}
