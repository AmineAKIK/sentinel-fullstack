import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { sendError } from '../utils/errors';

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
  const token = req.cookies?.sentinel_workshop_token;

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
    req.workshopUser = payload;
    next();
  } catch {
    sendError(res, 401, 'UNAUTHORIZED', 'Session invalide ou expirée.');
  }
}
