import { Request, Response, NextFunction } from 'express';
import { ADMIN_AUTH_COOKIE } from '../auth/authCookies';
import {
  handleJwtError,
  sendInvalidServerConfig,
  sendInvalidSession,
  sendMissingAuth,
} from '../auth/authResponses';
import { getJwtSecret, verifyAuthToken } from '../auth/jwt';
import { getAdminSessionVersion } from '../modules/adminCredentials/adminCredentials.repository';

export interface AdminPayload {
  adminId: number;
  username: string;
  sessionVersion?: number;
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

    const currentVersion = await getAdminSessionVersion(payload.adminId);
    if (currentVersion === null) {
      sendInvalidSession(res);
      return;
    }

    // If the token carries a version, reject it if it doesn't match the current one.
    // Tokens without sessionVersion (issued before migration 022) are still accepted
    // until they naturally expire.
    if (payload.sessionVersion !== undefined && payload.sessionVersion !== currentVersion) {
      sendInvalidSession(res);
      return;
    }

    req.admin = payload;
    next();
  } catch (err) {
    handleJwtError(err, res);
  }
}
