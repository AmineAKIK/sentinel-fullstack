import { Request, Response } from 'express';
import { ADMIN_AUTH_COOKIE, WORKSHOP_AUTH_COOKIE, setAuthCookie, clearAuthCookie } from '../../auth/authCookies';
import { signAuthToken, verifyAuthToken, isJwtSessionError } from '../../auth/jwt';
import { sendError } from '../../utils/errors';
import { sendInvalidServerConfig } from '../../auth/authResponses';
import { handleControllerError } from '../../utils/controller';
import { unifiedLoginService, verifyAdminSession, verifyWorkshopSession } from './auth.service';
import { loginSchema } from './auth.validation';
import { loginLimiter } from '../../middlewares/loginRateLimit';
import { AdminPayload } from '../../middlewares/adminAuth';
import { WorkshopPayload } from '../../middlewares/workshopAuth';
import { getAppSettings } from '../adminCredentials/adminCredentials.repository';

export async function login(req: Request, res: Response): Promise<void> {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Requête invalide.');
    return;
  }
  const { identifier, password, newPassword, setupCode } = parsed.data;

  try {
    const settings = await getAppSettings();

    if (loginLimiter.isLimited(req, settings.login_max_attempts)) {
      sendError(res, 429, 'RATE_LIMITED', `Trop de tentatives. Réessayez plus tard.`);
      return;
    }

    const result = await unifiedLoginService(identifier, password, newPassword, setupCode);

    switch (result.kind) {
      case 'invalid_credentials':
        loginLimiter.recordFailure(req, settings.login_max_attempts);
        sendError(res, 401, 'UNAUTHORIZED', 'Identifiants incorrects.');
        return;

      case 'admin_requires_password':
        res.status(200).json({ requiresPassword: true });
        return;

      case 'workshop_requires_password_setup':
        res.status(200).json({ requiresPasswordSetup: true, badge_number: result.badgeNumber });
        return;

      case 'workshop_requires_password':
        res.status(200).json({ requiresPassword: true, badge_number: result.badgeNumber });
        return;

      case 'workshop_account_disabled':
        sendError(res, 403, 'FORBIDDEN', 'Votre accès atelier a été suspendu. Contactez votre responsable.');
        return;

      case 'workshop_invalid_setup_code':
        loginLimiter.recordFailure(req, settings.login_max_attempts);
        sendError(res, 401, 'UNAUTHORIZED', 'Code temporaire incorrect.');
        return;

      case 'workshop_expired_setup_code':
        loginLimiter.recordFailure(req, settings.login_max_attempts);
        sendError(res, 401, 'UNAUTHORIZED', "Code temporaire expiré ou absent. Demandez une réinitialisation à l'administrateur.");
        return;

      case 'admin_success': {
        const token = signAuthToken(
          { adminId: result.admin.id, username: result.admin.username, sessionVersion: result.admin.sessionVersion },
          settings.session_duration_hours
        );
        if (!token) { sendInvalidServerConfig(res); return; }
        loginLimiter.clear(req);
        setAuthCookie(res, ADMIN_AUTH_COOKIE, token, settings.session_duration_hours);
        res.json({ accountType: 'admin', id: result.admin.id, username: result.admin.username });
        return;
      }

      case 'workshop_success': {
        const token = signAuthToken(
          { userId: result.user.id, badgeNumber: result.user.badge_number, role: result.user.role, sessionVersion: result.user.sessionVersion },
          settings.workshop_session_hours
        );
        if (!token) { sendInvalidServerConfig(res); return; }
        loginLimiter.clear(req);
        setAuthCookie(res, WORKSHOP_AUTH_COOKIE, token, settings.workshop_session_hours);
        res.json({
          accountType: 'workshop',
          id: result.user.id,
          first_name: result.user.first_name,
          last_name: result.user.last_name,
          badge_number: result.user.badge_number,
          role: result.user.role,
        });
        return;
      }
    }
  } catch (err) {
    handleControllerError(res, 'unifiedLogin', err);
  }
}

export async function me(req: Request, res: Response): Promise<void> {
  const adminToken = req.cookies?.[ADMIN_AUTH_COOKIE];
  const workshopToken = req.cookies?.[WORKSHOP_AUTH_COOKIE];

  try {
    if (adminToken) {
      const payload = verifyAuthToken<AdminPayload>(adminToken);
      if (payload) {
        const admin = await verifyAdminSession(payload.adminId, payload.sessionVersion);
        if (admin) {
          res.json({ accountType: 'admin', id: admin.id, username: admin.username });
          return;
        }
        clearAuthCookie(res, ADMIN_AUTH_COOKIE);
      }
    }

    if (workshopToken) {
      const payload = verifyAuthToken<WorkshopPayload>(workshopToken);
      if (payload) {
        const user = await verifyWorkshopSession(payload.userId, payload.badgeNumber, payload.sessionVersion);
        if (user) {
          res.json({ accountType: 'workshop', id: user.id, first_name: user.first_name, last_name: user.last_name, badge_number: user.badge_number, role: user.role });
          return;
        }
        clearAuthCookie(res, WORKSHOP_AUTH_COOKIE);
      }
    }

    sendError(res, 401, 'UNAUTHORIZED', 'Non authentifié.');
  } catch (err) {
    if (isJwtSessionError(err)) {
      clearAuthCookie(res, ADMIN_AUTH_COOKIE);
      clearAuthCookie(res, WORKSHOP_AUTH_COOKIE);
      sendError(res, 401, 'UNAUTHORIZED', 'Session expirée.');
      return;
    }
    handleControllerError(res, 'authMe', err);
  }
}

export function logout(req: Request, res: Response): void {
  clearAuthCookie(res, ADMIN_AUTH_COOKIE);
  clearAuthCookie(res, WORKSHOP_AUTH_COOKIE);
  res.json({ message: 'Déconnecté.' });
}
