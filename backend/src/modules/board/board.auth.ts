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
import { getBoardSettingsGlobal, getAppSettings } from '../adminCredentials/adminCredentials.repository';

const BOARD_AUTH_COOKIE = 'sentinel_board_token';

interface BoardPayload {
  scope: 'board';
  label: string;
  boardSessionVersion: number;
}

interface WorkshopPayload {
  userId: number;
  badgeNumber: string;
  role: string;
}

export function hashBoardCode(code: string): string {
  return crypto.createHash('sha256').update(code.trim(), 'utf8').digest('hex');
}

function timingSafeHashEquals(left: string, right: string): boolean {
  if (!left || !right) return false;
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function setBoardCookie(res: Response, token: string, ttlMs: number | 'unlimited'): void {
  res.cookie(BOARD_AUTH_COOKIE, token, {
    ...authCookieOptions,
    ...(ttlMs !== 'unlimited' ? { maxAge: ttlMs } : {}),
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

async function hasValidBoardSession(req: Request, res: Response): Promise<boolean> {
  const token = req.cookies?.[BOARD_AUTH_COOKIE];
  if (!token) return false;

  const payload = verifyAuthToken<BoardPayload>(token);
  if (payload?.scope !== 'board') {
    clearBoardCookie(res);
    return false;
  }

  const settings = await getBoardSettingsGlobal();
  if (!settings) return false;
  if (!settings.board_enabled) {
    clearBoardCookie(res);
    return false;
  }
  if (payload.boardSessionVersion !== settings.board_session_version) {
    clearBoardCookie(res);
    return false;
  }

  return true;
}

export async function boardReadAuthMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!getJwtSecret()) {
    sendInvalidServerConfig(res);
    return;
  }

  try {
    if (await hasValidBoardSession(req, res) || await hasValidWorkshopSession(req, res)) {
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
    const hasAccess = await hasValidBoardSession(req, res) || await hasValidWorkshopSession(req, res);
    if (!hasAccess) {
      sendMissingAuth(res);
      return;
    }
    const { board_label, board_session_ttl_hours } = await getAppSettings();
    res.json({ access: true, label: board_label, expiresInHours: board_session_ttl_hours });
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

boardRouter.post('/session', async (req, res) => {
  if (!getJwtSecret()) {
    sendInvalidServerConfig(res);
    return;
  }

  try {
    const [boardSettings, appSettings] = await Promise.all([
      getBoardSettingsGlobal(),
      getAppSettings(),
    ]);

    if (boardSettings && !boardSettings.board_enabled) {
      sendError(res, 503, 'SERVICE_UNAVAILABLE', 'Le tableau d\'atelier est fermé.');
      return;
    }

    const activeHash = boardSettings?.board_code_hash || process.env.BOARD_ACCESS_CODE_HASH || '';
    if (!activeHash) {
      sendError(res, 503, 'SERVICE_UNAVAILABLE', 'Le tableau d\'atelier n\'est pas encore configuré.');
      return;
    }

    const code = typeof req.body?.code === 'string' ? req.body.code : '';
    if (!code.trim() || code.length > FIELD_LIMITS.CODE) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Code board requis.');
      return;
    }

    if (!timingSafeHashEquals(hashBoardCode(code), activeHash)) {
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

    const { board_label, board_session_ttl_hours } = appSettings;
    const boardSessionVersion = boardSettings?.board_session_version ?? 0;
    const unlimited = board_session_ttl_hours === 0;

    const token = unlimited
      ? jwt.sign({ scope: 'board', label: board_label, boardSessionVersion }, secret)
      : jwt.sign(
          { scope: 'board', label: board_label, boardSessionVersion },
          secret,
          { expiresIn: `${board_session_ttl_hours}h` }
        );

    setBoardCookie(res, token, unlimited ? 'unlimited' : board_session_ttl_hours * 60 * 60 * 1000);
    res.json({ access: true, label: board_label, expiresInHours: board_session_ttl_hours });
  } catch (err) {
    logger.error({ err }, 'Board session error');
    sendError(res, 503, 'SERVICE_UNAVAILABLE', 'Service temporairement indisponible.');
  }
});

boardRouter.post('/logout', (_req, res) => {
  clearBoardCookie(res);
  res.json({ message: 'Accès board fermé.' });
});

boardRouter.get('/data', boardReadAuthMiddleware, getBoardData);
