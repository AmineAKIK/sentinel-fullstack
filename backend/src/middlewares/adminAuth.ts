import { Request, Response, NextFunction } from 'express';
import { ADMIN_AUTH_COOKIE } from '../auth/authCookies';
import {
  handleJwtError,
  sendInvalidServerConfig,
  sendInvalidSession,
  sendMissingAuth,
} from '../auth/authResponses';
import { getJwtSecret, verifyAuthToken } from '../auth/jwt';
import { AdminSessionPayload, isAdminSessionPayload } from '../auth/sessionPayloads';
import { getAdminSessionVersion } from '../modules/adminCredentials/adminCredentials.repository';

export type AdminPayload = AdminSessionPayload;

declare global {
  namespace Express {
    interface Request {
      admin?: AdminPayload;
    }
  }
}

export function adminAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
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
    const payload = verifyAuthToken(token, 'admin');
    if (!isAdminSessionPayload(payload)) {
      sendInvalidSession(res);
      return;
    }

    const currentVersion = await getAdminSessionVersion(payload.adminId);
    if (currentVersion === null) {
      sendInvalidSession(res);
      return;
    }

    if (payload.sessionVersion !== currentVersion) {
      sendInvalidSession(res);
      return;
    }

    req.admin = payload;
    next();
  } catch (err) {
    handleJwtError(err, res);
  }
}
