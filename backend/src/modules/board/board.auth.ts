import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { NextFunction, Request, Response, Router } from 'express';
import { WORKSHOP_AUTH_COOKIE, authCookieOptions, clearAuthCookie } from '../../auth/authCookies';
import { sendInvalidServerConfig, sendInvalidSession, sendMissingAuth } from '../../auth/authResponses';
import { getJwtSecret, isJwtSessionError, verifyAuthToken } from '../../auth/jwt';
import pool from '../../db/pool';
import { sendError } from '../../utils/errors';
import { getBoardData } from '../workshop/workshop.controller';
import { FIELD_LIMITS } from '../../domain/constants';
import { loginLimiter } from '../../middlewares/loginRateLimit';
import logger from '../../logger';

const BOARD_AUTH_COOKIE = 'sentinel_board_token';
const BOARD_ACCESS_CODE_HASH = process.env.BOARD_ACCESS_CODE_HASH || '';
const BOARD_ACCESS_LABEL = process.env.BOARD_ACCESS_LABEL || 'Board atelier';
const BOARD_SESSION_TTL_HOURS = Math.max(1, parseInt(process.env.BOARD_SESSION_TTL_HOURS || '12', 10));
const BOARD_SESSION_TTL_MS = BOARD_SESSION_TTL_HOURS * 60 * 60 * 1000;

interface BoardPayload {
  scope: 'board';
  label: string;
}

interface WorkshopPayload {
  userId: number;
  badgeNumber: string;
  role: string;
}

function hashAccessCode(code: string): string {
  return crypto.createHash('sha256').update(code.trim(), 'utf8').digest('hex');
}

function timingSafeHashEquals(left: string, right: string): boolean {
  if (!left || !right) return false;
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function setBoardCookie(res: Response, token: string): void {
  res.cookie(BOARD_AUTH_COOKIE, token, {
    ...authCookieOptions,
    maxAge: BOARD_SESSION_TTL_MS,
  });
}

function clearBoardCookie(res: Response): void {
  clearAuthCookie(res, BOARD_AUTH_COOKIE);
}

async function hasValidWorkshopSession(req: Request, res: Response): Promise<boolean> {
  const token = req.cookies?.[WORKSHOP_AUTH_COOKIE];
  if (!token) return false;

  const payload = verifyAuthToken<WorkshopPayload>(token);
  if (!payload) return false;

  const { rows } = await pool.query(
    `SELECT id
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
    return false;
  }

  return true;
}

function hasValidBoardSession(req: Request, res: Response): boolean {
  const token = req.cookies?.[BOARD_AUTH_COOKIE];
  if (!token) return false;

  const payload = verifyAuthToken<BoardPayload>(token);
  if (payload?.scope === 'board') return true;

  clearBoardCookie(res);
  return false;
}

export async function boardReadAuthMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!getJwtSecret()) {
    sendInvalidServerConfig(res);
    return;
  }

  try {
    if (hasValidBoardSession(req, res) || await hasValidWorkshopSession(req, res)) {
      next();
      return;
    }

    sendMissingAuth(res);
  } catch (err) {
    if (isJwtSessionError(err)) {
      clearBoardCookie(res);
      sendInvalidSession(res);
      return;
    }
    logger.error({ err }, 'Board auth middleware error');
    sendError(res, 503, 'SERVICE_UNAVAILABLE', 'Service temporairement indisponible.');
  }
}

export const boardRouter = Router();

boardRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

boardRouter.get('/me', async (req, res) => {
  if (!getJwtSecret()) {
    sendInvalidServerConfig(res);
    return;
  }

  try {
    const hasAccess = hasValidBoardSession(req, res) || await hasValidWorkshopSession(req, res);
    if (!hasAccess) {
      sendMissingAuth(res);
      return;
    }

    res.json({ access: true, label: BOARD_ACCESS_LABEL, expiresInHours: BOARD_SESSION_TTL_HOURS });
  } catch (err) {
    if (isJwtSessionError(err)) {
      clearBoardCookie(res);
      sendInvalidSession(res);
      return;
    }
    logger.error({ err }, 'Board me error');
    sendError(res, 503, 'SERVICE_UNAVAILABLE', 'Service temporairement indisponible.');
  }
});

boardRouter.post('/session', (req, res) => {
  if (!getJwtSecret()) {
    sendInvalidServerConfig(res);
    return;
  }

  if (!BOARD_ACCESS_CODE_HASH) {
    sendError(res, 503, 'SERVICE_UNAVAILABLE', 'Accès board non configuré.');
    return;
  }

  const code = typeof req.body?.code === 'string' ? req.body.code : '';
  if (!code.trim() || code.length > FIELD_LIMITS.CODE) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Code board requis.');
    return;
  }

  if (!timingSafeHashEquals(hashAccessCode(code), BOARD_ACCESS_CODE_HASH)) {
    // Code board partagé (pas d'identité) → le limiteur clé par IP. On compte
    // l'échec ici, comme pour le login utilisateur.
    loginLimiter.recordFailure(req);
    sendError(res, 401, 'UNAUTHORIZED', 'Code board incorrect.');
    return;
  }

  loginLimiter.clear(req);

  const secret = getJwtSecret();
  if (!secret) {
    sendInvalidServerConfig(res);
    return;
  }

  const token = jwt.sign(
    { scope: 'board', label: BOARD_ACCESS_LABEL },
    secret,
    { expiresIn: `${BOARD_SESSION_TTL_HOURS}h` }
  );

  setBoardCookie(res, token);
  res.json({ access: true, label: BOARD_ACCESS_LABEL, expiresInHours: BOARD_SESSION_TTL_HOURS });
});

boardRouter.post('/logout', (_req, res) => {
  clearBoardCookie(res);
  res.json({ message: 'Accès board fermé.' });
});

boardRouter.get('/data', boardReadAuthMiddleware, getBoardData);
