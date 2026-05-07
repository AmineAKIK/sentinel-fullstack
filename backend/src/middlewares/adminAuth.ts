import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
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
  const token = req.cookies?.sentinel_admin_token;

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
    const payload = jwt.verify(token, secret) as AdminPayload;
    req.admin = payload;
    next();
  } catch {
    sendError(res, 401, 'UNAUTHORIZED', 'Session invalide ou expirée.');
  }
}
