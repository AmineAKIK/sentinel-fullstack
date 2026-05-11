import { Request, Response, NextFunction } from 'express';
import { ADMIN_AUTH_COOKIE } from '../auth/authCookies';
import {
  sendInvalidServerConfig,
  sendInvalidSession,
  sendMissingAuth,
} from '../auth/authResponses';
import { getJwtSecret, verifyAuthToken } from '../auth/jwt';

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
    req.admin = payload;
    next();
  } catch {
    sendInvalidSession(res);
  }
}
