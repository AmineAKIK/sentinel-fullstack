import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../db/pool';
import { sendError } from '../utils/errors';

const COOKIE_NAME = 'sentinel_workshop_token';
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
};

export interface WorkshopPayload {
  userId: number;
  badgeNumber: string;
  role: string;
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
  const token = req.cookies?.[COOKIE_NAME];

  if (!token) {
    sendError(res, 401, 'UNAUTHORIZED', 'Authentification requise.');
    return;
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    sendError(res, 500, 'SERVER_ERROR', 'Configuration du serveur invalide.');
    return;
  }

  try {
    const payload = jwt.verify(token, secret) as WorkshopPayload;
    const { rows } = await pool.query(
      `SELECT id, badge_number, role, password_hash
       FROM sentinel_users
       WHERE id = $1
         AND badge_number = $2
         AND is_active = TRUE
         AND is_deleted = FALSE`,
      [payload.userId, payload.badgeNumber]
    );

    if (rows.length === 0) {
      res.clearCookie(COOKIE_NAME, COOKIE_OPTIONS);
      sendError(res, 401, 'UNAUTHORIZED', 'Utilisateur inactif ou introuvable.');
      return;
    }

    const user = rows[0];
    if (!user.password_hash) {
      res.clearCookie(COOKIE_NAME, COOKIE_OPTIONS);
      sendError(res, 401, 'UNAUTHORIZED', 'Mot de passe à réinitialiser.');
      return;
    }

    req.workshopUser = {
      userId: user.id,
      badgeNumber: user.badge_number,
      role: user.role,
    };
    next();
  } catch (err) {
    if (err instanceof jwt.JsonWebTokenError || err instanceof jwt.TokenExpiredError) {
      res.clearCookie(COOKIE_NAME, COOKIE_OPTIONS);
      sendError(res, 401, 'UNAUTHORIZED', 'Session invalide ou expirée.');
      return;
    }
    console.error('Workshop auth middleware error:', err);
    sendError(res, 401, 'UNAUTHORIZED', 'Session invalide ou expirée.');
  }
}
