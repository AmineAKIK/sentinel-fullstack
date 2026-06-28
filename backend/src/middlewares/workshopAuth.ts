import { Request, Response, NextFunction } from 'express';
import { clearAuthCookie, WORKSHOP_AUTH_COOKIE } from '../auth/authCookies';
import {
  handleJwtError,
  sendInvalidServerConfig,
  sendMissingAuth,
} from '../auth/authResponses';
import { getJwtSecret, verifyAuthToken } from '../auth/jwt';
import pool from '../db/pool';
import { sendError } from '../utils/errors';

export interface WorkshopPayload {
  userId: number;
  badgeNumber: string;
  role: string;
  sessionVersion: number;
}

declare global {
  namespace Express {
    interface Request {
      workshopUser?: WorkshopPayload;
    }
  }
}

export function workshopAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  void authenticateWorkshopRequest(req, res, next);
}

async function authenticateWorkshopRequest(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = req.cookies?.[WORKSHOP_AUTH_COOKIE];

  if (!token) {
    sendMissingAuth(res);
    return;
  }

  if (!getJwtSecret()) {
    sendInvalidServerConfig(res);
    return;
  }

  try {
    const payload = verifyAuthToken<WorkshopPayload>(token);
    if (!payload) {
      sendInvalidServerConfig(res);
      return;
    }
    const { rows } = await pool.query<{ id: number; badge_number: string; role: string; session_version: number }>(
      `SELECT id, badge_number, role, session_version
       FROM sentinel_users
       WHERE id = $1
         AND badge_number = $2
         AND is_active = TRUE
         AND is_deleted = FALSE
         AND password_hash IS NOT NULL`,
      [payload.userId, payload.badgeNumber]
    );

    if (rows.length === 0) {
      clearAuthCookie(res, WORKSHOP_AUTH_COOKIE);
      sendError(res, 401, 'UNAUTHORIZED', 'Utilisateur inactif ou introuvable.');
      return;
    }

    const user = rows[0];

    if (user.session_version !== payload.sessionVersion) {
      clearAuthCookie(res, WORKSHOP_AUTH_COOKIE);
      sendError(res, 401, 'UNAUTHORIZED', 'Session expirée.');
      return;
    }

    req.workshopUser = {
      userId: user.id,
      badgeNumber: user.badge_number,
      role: user.role,
      sessionVersion: user.session_version,
    };
    next();
  } catch (err) {
    clearAuthCookie(res, WORKSHOP_AUTH_COOKIE);
    handleJwtError(err, res);
  }
}
