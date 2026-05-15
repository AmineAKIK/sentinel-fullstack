import { Request, Response, NextFunction } from 'express';
import { ADMIN_AUTH_COOKIE } from '../auth/authCookies';
import {
  sendInvalidServerConfig,
  sendInvalidSession,
  sendMissingAuth,
} from '../auth/authResponses';
import { getJwtSecret, isJwtSessionError, verifyAuthToken } from '../auth/jwt';
import pool from '../db/pool';
import { sendError } from '../utils/errors';

export interface AdminPayload {
  adminId: number;
  username: string;
}

declare global {
  namespace Express {
    interface Request {
      admin?: AdminPayload;
    }
  }
}

export function adminAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  void authenticateAdminRequest(req, res, next);
}

async function authenticateAdminRequest(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = req.cookies?.[ADMIN_AUTH_COOKIE];

  if (!token) {
    sendMissingAuth(res);
    return;
  }

  if (!getJwtSecret()) {
    sendInvalidServerConfig(res);
    return;
  }

  try {
    const payload = verifyAuthToken<AdminPayload>(token);
    if (!payload) {
      sendInvalidServerConfig(res);
      return;
    }

    const { rows } = await pool.query(
      `SELECT id FROM admin_accounts WHERE id = $1`,
      [payload.adminId]
    );

    if (rows.length === 0) {
      sendInvalidSession(res);
      return;
    }

    req.admin = payload;
    next();
  } catch (err) {
    if (isJwtSessionError(err)) {
      sendInvalidSession(res);
      return;
    }
    console.error('Admin auth middleware error:', err);
    sendError(res, 503, 'SERVICE_UNAVAILABLE', 'Service temporairement indisponible.');
  }
}
