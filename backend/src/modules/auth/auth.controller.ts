import { Request, Response } from 'express';
import { ADMIN_AUTH_COOKIE, WORKSHOP_AUTH_COOKIE, setAuthCookie, clearAuthCookie } from '../../auth/authCookies';
import { signAuthToken, verifyAuthToken, isJwtSessionError } from '../../auth/jwt';
import { sendError } from '../../utils/errors';
import { sendInvalidServerConfig } from '../../auth/authResponses';
import { handleControllerError } from '../../utils/controller';
import { unifiedLoginService } from './auth.service';
import { AdminPayload } from '../../middlewares/adminAuth';
import { WorkshopPayload } from '../../middlewares/workshopAuth';
import pool from '../../db/pool';

export async function login(req: Request, res: Response): Promise<void> {
  const { identifier, password, newPassword, setupCode } = req.body;

  if (!identifier || typeof identifier !== 'string' || !identifier.trim()) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Identifiant requis.');
    return;
  }

  try {
    const result = await unifiedLoginService(
      identifier.trim(),
      password,
      newPassword,
      setupCode
    );

    switch (result.kind) {
      case 'invalid_credentials':
        sendError(res, 401, 'UNAUTHORIZED', 'Identifiants incorrects.');
        return;

      case 'admin_requires_password':
        res.status(200).json({ requiresPassword: true, username: result.username });
        return;

      case 'workshop_requires_password_setup':
        res.status(200).json({ requiresPasswordSetup: true, badge_number: result.badgeNumber });
        return;

      case 'workshop_requires_password':
        res.status(200).json({ requiresPassword: true, badge_number: result.badgeNumber });
        return;

      case 'workshop_invalid_setup_code':
        sendError(res, 401, 'UNAUTHORIZED', 'Code temporaire incorrect.');
        return;

      case 'workshop_expired_setup_code':
        sendError(res, 401, 'UNAUTHORIZED', "Code temporaire expiré ou absent. Demandez une réinitialisation à l'administrateur.");
        return;

      case 'admin_success': {
        const token = signAuthToken({ adminId: result.admin.id, username: result.admin.username });
        if (!token) { sendInvalidServerConfig(res); return; }
        setAuthCookie(res, ADMIN_AUTH_COOKIE, token);
        res.json({ accountType: 'admin', id: result.admin.id, username: result.admin.username });
        return;
      }

      case 'workshop_success': {
        const token = signAuthToken({
          userId: result.user.id,
          badgeNumber: result.user.badge_number,
          role: result.user.role,
        });
        if (!token) { sendInvalidServerConfig(res); return; }
        setAuthCookie(res, WORKSHOP_AUTH_COOKIE, token);
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
        const { rows } = await pool.query(
          'SELECT id, username FROM admin_accounts WHERE id = $1',
          [payload.adminId]
        );
        if (rows.length > 0) {
          res.json({ accountType: 'admin', id: rows[0].id, username: rows[0].username });
          return;
        }
        clearAuthCookie(res, ADMIN_AUTH_COOKIE);
      }
    }

    if (workshopToken) {
      const payload = verifyAuthToken<WorkshopPayload>(workshopToken);
      if (payload) {
        const { rows } = await pool.query(
          `SELECT id, first_name, last_name, badge_number, role
           FROM sentinel_users
           WHERE id = $1 AND badge_number = $2 AND is_active = TRUE AND is_deleted = FALSE AND password_hash IS NOT NULL`,
          [payload.userId, payload.badgeNumber]
        );
        if (rows.length > 0) {
          const u = rows[0];
          res.json({ accountType: 'workshop', id: u.id, first_name: u.first_name, last_name: u.last_name, badge_number: u.badge_number, role: u.role });
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

export async function logout(req: Request, res: Response): Promise<void> {
  clearAuthCookie(res, ADMIN_AUTH_COOKIE);
  clearAuthCookie(res, WORKSHOP_AUTH_COOKIE);
  res.json({ message: 'Déconnecté.' });
}
