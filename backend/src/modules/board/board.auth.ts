import crypto from 'crypto';
import { NextFunction, Request, Response, Router } from 'express';
import { WORKSHOP_AUTH_COOKIE, authCookieOptions, clearAuthCookie } from '../../auth/authCookies';
import {
  sendInvalidServerConfig,
  sendInvalidSession,
  sendMissingAuth,
} from '../../auth/authResponses';
import { getJwtSecret, isJwtSessionError, signAuthToken, verifyAuthToken } from '../../auth/jwt';
import { isBoardSessionPayload, isWorkshopSessionPayload } from '../../auth/sessionPayloads';
import { BCRYPT_ROUNDS_WORKSHOP, verifyPassword } from '../../auth/bcrypt';
import bcrypt from 'bcrypt';
import pool from '../../db/pool';
import { sendError } from '../../utils/errors';
import { getBoardData } from '../workshop/workshop.controller';
import { FIELD_LIMITS } from '../../domain/constants';
import { loginLimiter } from '../../middlewares/loginRateLimit';
import logger from '../../logger';
import {
  getBoardSettingsGlobal,
  getAppSettings,
  upgradeBoardCodeHash,
} from '../adminCredentials/adminCredentials.repository';

const BOARD_AUTH_COOKIE = 'sentinel_board_token';

export function hashBoardCode(code: string): Promise<string> {
  return bcrypt.hash(code.trim(), BCRYPT_ROUNDS_WORKSHOP);
}

function timingSafeHashEquals(left: string, right: string): boolean {
  if (!left || !right) return false;
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export async function verifyBoardCode(code: string, storedHash: string): Promise<boolean> {
  if (storedHash.startsWith('$2')) {
    return verifyPassword(code.trim(), storedHash);
  }
  return timingSafeHashEquals(
    crypto.createHash('sha256').update(code.trim(), 'utf8').digest('hex'),
    storedHash
  );
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

  const payload = verifyAuthToken(token, 'workshop');
  if (!isWorkshopSessionPayload(payload)) return false;

  const { rows } = await pool.query<{ id: number; session_version: number }>(
    `SELECT id, session_version
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

  // Même règle que workshopAuthMiddleware : un token émis avant une révocation
  // (session_version incrémentée) ne donne plus accès au board.
  if (rows[0].session_version !== payload.sessionVersion) {
    clearAuthCookie(res, WORKSHOP_AUTH_COOKIE);
    return false;
  }

  return true;
}

async function hasValidBoardSession(req: Request, res: Response): Promise<boolean> {
  const token = req.cookies?.[BOARD_AUTH_COOKIE];
  if (!token) return false;

  const payload = verifyAuthToken(token, 'board');
  if (!isBoardSessionPayload(payload)) {
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

export async function boardReadAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!getJwtSecret()) {
    sendInvalidServerConfig(res);
    return;
  }

  try {
    if ((await hasValidBoardSession(req, res)) || (await hasValidWorkshopSession(req, res))) {
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
    const hasAccess =
      (await hasValidBoardSession(req, res)) || (await hasValidWorkshopSession(req, res));
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
      sendError(res, 503, 'SERVICE_UNAVAILABLE', "Le tableau n'est pas disponible pour le moment.");
      return;
    }

    const activeHash = boardSettings?.board_code_hash || process.env.BOARD_ACCESS_CODE_HASH || '';
    if (!activeHash) {
      sendError(
        res,
        503,
        'SERVICE_UNAVAILABLE',
        "Le tableau d'atelier n'est pas encore configuré."
      );
      return;
    }

    const code = typeof req.body?.code === 'string' ? req.body.code : '';
    if (!code.trim() || code.length > FIELD_LIMITS.CODE) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Code board requis.');
      return;
    }

    if (!(await verifyBoardCode(code, activeHash))) {
      loginLimiter.recordFailure(req);
      sendError(res, 401, 'UNAUTHORIZED', 'Code board incorrect.');
      return;
    }

    loginLimiter.clear(req);

    if (
      boardSettings?.id &&
      boardSettings.board_code_hash === activeHash &&
      !activeHash.startsWith('$2')
    ) {
      await upgradeBoardCodeHash(boardSettings.id, await hashBoardCode(code));
    }

    const secret = getJwtSecret();
    if (!secret) {
      sendInvalidServerConfig(res);
      return;
    }

    const { board_label, board_session_ttl_hours } = appSettings;
    const boardSessionVersion = boardSettings?.board_session_version ?? 0;
    const token = signAuthToken(
      { label: board_label, boardSessionVersion },
      board_session_ttl_hours,
      'board'
    );
    if (!token) {
      sendInvalidServerConfig(res);
      return;
    }

    setBoardCookie(res, token, board_session_ttl_hours * 60 * 60 * 1000);
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
