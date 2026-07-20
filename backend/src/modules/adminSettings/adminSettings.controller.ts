import { Request, Response } from 'express';
import { sendUnauthenticated } from '../../auth/authResponses';
import { sendError } from '../../utils/errors';
import { handleControllerError } from '../../utils/controller';
import { createAdminSystemAuditEvent } from '../adminAudit/adminAudit.events';
import {
  getAdminNotifPrefs,
  updateAdminNotifPrefs,
  AdminNotifPrefs,
  getBoardSettings,
  updateBoardEnabled,
  updateBoardCodeHash,
  incrementBoardSessionVersion,
  incrementAdminSessionVersion,
  getAppSettingsById,
  updateAppSettings,
  incrementAllWorkshopSessionVersions,
  AppSettings,
} from '../adminCredentials/adminCredentials.repository';
import {
  isWithinBcryptByteLimit,
  hasMinimumPasswordLength,
  MAX_PASSWORD_BYTES,
  MIN_BOARD_CODE_LENGTH,
} from '../../auth/bcrypt';
import { hashBoardCode } from '../board/board.auth';
import { FIELD_LIMITS } from '../../domain/constants';
import { withTransaction } from '../../db/transaction';
import { ADMIN_AUTH_COOKIE, clearAuthCookie } from '../../auth/authCookies';
import { reauthenticateAdmin } from '../adminSecurity/adminReauthentication.service';
import { sendAdminReauthenticationFailure } from '../adminSecurity/adminReauthentication.http';

const PREF_KEYS: (keyof AdminNotifPrefs)[] = [
  'notif_admin',
  'notif_responsables',
  'notif_techniciens',
  'notif_operateurs',
];

export async function getNotifPrefs(req: Request, res: Response): Promise<void> {
  if (!req.admin) {
    sendUnauthenticated(res);
    return;
  }
  try {
    const prefs = await getAdminNotifPrefs(req.admin.adminId);
    res.json(
      prefs ?? {
        notif_admin: true,
        notif_responsables: true,
        notif_techniciens: true,
        notif_operateurs: true,
      }
    );
  } catch (err) {
    handleControllerError(res, 'getNotifPrefs', err);
  }
}

export async function patchNotifPrefs(req: Request, res: Response): Promise<void> {
  if (!req.admin) {
    sendUnauthenticated(res);
    return;
  }

  const body = req.body || {};
  const patch: Partial<AdminNotifPrefs> = {};

  for (const key of PREF_KEYS) {
    if (key in body) {
      if (typeof body[key] !== 'boolean') {
        sendError(res, 400, 'VALIDATION_ERROR', `${key} doit être un booléen.`);
        return;
      }
      patch[key] = body[key];
    }
  }

  if (Object.keys(patch).length === 0) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Aucune préférence à mettre à jour.');
    return;
  }

  try {
    await withTransaction(async (client) => {
      const updated = await updateAdminNotifPrefs(req.admin!.adminId, patch, client);
      if (!updated) throw new Error('Préférences administrateur introuvables.');
      await createAdminSystemAuditEvent(req.admin!.adminId, 'ADMIN_NOTIF_UPDATED', patch, client);
    });
    const updated = await getAdminNotifPrefs(req.admin.adminId);
    res.json(updated);
  } catch (err) {
    handleControllerError(res, 'patchNotifPrefs', err);
  }
}

export async function patchBoardToggle(req: Request, res: Response): Promise<void> {
  if (!req.admin) {
    sendUnauthenticated(res);
    return;
  }
  const { enabled, currentPassword } = req.body || {};
  if (typeof enabled !== 'boolean') {
    sendError(res, 400, 'VALIDATION_ERROR', 'enabled doit être un booléen.');
    return;
  }
  // Opération critique : le mot de passe est exigé par l'API elle-même, pas
  // seulement par le modal de confirmation côté UI (defense in depth).
  if (
    !currentPassword ||
    typeof currentPassword !== 'string' ||
    !isWithinBcryptByteLimit(currentPassword)
  ) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Mot de passe actuel requis.');
    return;
  }
  try {
    const authentication = await reauthenticateAdmin(req.admin.adminId, currentPassword);
    if (!authentication.ok) {
      sendAdminReauthenticationFailure(res, authentication.reason);
      return;
    }

    await withTransaction(async (client) => {
      await updateBoardEnabled(req.admin!.adminId, enabled, client);
      if (!enabled) await incrementBoardSessionVersion(req.admin!.adminId, client);
      await createAdminSystemAuditEvent(req.admin!.adminId, 'BOARD_TOGGLED', { enabled }, client);
    });
    const updated = await getBoardSettings(req.admin.adminId);
    res.json({ board_enabled: updated?.board_enabled ?? true });
  } catch (err) {
    handleControllerError(res, 'patchBoardToggle', err);
  }
}

export async function patchBoardCode(req: Request, res: Response): Promise<void> {
  if (!req.admin) {
    sendUnauthenticated(res);
    return;
  }
  const { newCode, confirmCode, currentPassword } = req.body || {};

  if (
    !currentPassword ||
    typeof currentPassword !== 'string' ||
    !isWithinBcryptByteLimit(currentPassword)
  ) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Mot de passe actuel requis.');
    return;
  }
  if (typeof newCode !== 'string' || newCode.trim().length === 0) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Nouveau code requis.');
    return;
  }
  const trimmed = newCode.trim();
  if (!hasMinimumPasswordLength(trimmed, MIN_BOARD_CODE_LENGTH)) {
    sendError(
      res,
      400,
      'VALIDATION_ERROR',
      `Le code board doit contenir au moins ${MIN_BOARD_CODE_LENGTH} caractères.`
    );
    return;
  }
  if (trimmed.length > FIELD_LIMITS.CODE || !isWithinBcryptByteLimit(trimmed)) {
    sendError(
      res,
      400,
      'VALIDATION_ERROR',
      `Le code board ne peut pas dépasser ${MAX_PASSWORD_BYTES} octets UTF-8.`
    );
    return;
  }
  if (trimmed !== (typeof confirmCode === 'string' ? confirmCode.trim() : '')) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Les deux codes ne correspondent pas.');
    return;
  }
  try {
    const authentication = await reauthenticateAdmin(req.admin.adminId, currentPassword);
    if (!authentication.ok) {
      sendAdminReauthenticationFailure(res, authentication.reason);
      return;
    }
    const boardCodeHash = await hashBoardCode(trimmed);
    await withTransaction(async (client) => {
      await updateBoardCodeHash(req.admin!.adminId, boardCodeHash, client);
      await createAdminSystemAuditEvent(req.admin!.adminId, 'BOARD_CODE_CHANGED', null, client);
    });
    res.json({ ok: true });
  } catch (err) {
    handleControllerError(res, 'patchBoardCode', err);
  }
}

export async function getBoardSettingsHandler(req: Request, res: Response): Promise<void> {
  if (!req.admin) {
    sendUnauthenticated(res);
    return;
  }
  try {
    const settings = await getBoardSettings(req.admin.adminId);
    res.json({
      board_enabled: settings?.board_enabled ?? true,
      hasCode: !!(settings?.board_code_hash || process.env.BOARD_ACCESS_CODE_HASH),
    });
  } catch (err) {
    handleControllerError(res, 'getBoardSettings', err);
  }
}

export async function getAppSettingsHandler(req: Request, res: Response): Promise<void> {
  if (!req.admin) {
    sendUnauthenticated(res);
    return;
  }
  try {
    const settings = await getAppSettingsById(req.admin.adminId);
    res.json(settings);
  } catch (err) {
    handleControllerError(res, 'getAppSettings', err);
  }
}

const APP_SETTINGS_BOUNDS: Record<
  keyof Omit<AppSettings, 'board_label'>,
  { min: number; max: number }
> = {
  session_duration_hours: { min: 1, max: 168 },
  workshop_session_hours: { min: 1, max: 168 },
  board_session_ttl_hours: { min: 1, max: 168 },
  login_max_attempts: { min: 3, max: 50 },
  setup_code_ttl_hours: { min: 1, max: 72 },
};

export async function patchAppSettingsHandler(req: Request, res: Response): Promise<void> {
  if (!req.admin) {
    sendUnauthenticated(res);
    return;
  }

  const body = req.body || {};
  const patch: Partial<AppSettings> = {};

  for (const [key, bounds] of Object.entries(APP_SETTINGS_BOUNDS)) {
    const k = key as keyof typeof APP_SETTINGS_BOUNDS;
    if (!(k in body)) continue;
    const val = body[k];
    if (typeof val !== 'number' || !Number.isInteger(val) || val < bounds.min || val > bounds.max) {
      sendError(
        res,
        400,
        'VALIDATION_ERROR',
        `${k} doit être un entier entre ${bounds.min} et ${bounds.max}.`
      );
      return;
    }
    patch[k] = val;
  }

  if ('board_label' in body) {
    const label = body.board_label;
    if (typeof label !== 'string' || label.trim().length === 0 || label.trim().length > 64) {
      sendError(
        res,
        400,
        'VALIDATION_ERROR',
        'board_label doit être une chaîne de 1 à 64 caractères.'
      );
      return;
    }
    patch.board_label = label.trim();
  }

  const revokeAdmin = body.revokeAdminSessions === true;
  const revokeWorkshop = body.revokeWorkshopSessions === true;
  const revokeBoard = body.revokeBoardSessions === true;
  const anyRevoke = revokeAdmin || revokeWorkshop || revokeBoard;

  if (Object.keys(patch).length === 0 && !anyRevoke) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Aucun paramètre à mettre à jour.');
    return;
  }

  // Révoquer des sessions est critique : mot de passe exigé par l'API,
  // pas seulement par le modal de confirmation côté UI.
  if (anyRevoke) {
    const { currentPassword } = body;
    if (
      !currentPassword ||
      typeof currentPassword !== 'string' ||
      !isWithinBcryptByteLimit(currentPassword)
    ) {
      sendError(
        res,
        400,
        'VALIDATION_ERROR',
        'Mot de passe actuel requis pour révoquer des sessions.'
      );
      return;
    }
  }

  try {
    if (anyRevoke) {
      const authentication = await reauthenticateAdmin(
        req.admin.adminId,
        body.currentPassword as string
      );
      if (!authentication.ok) {
        sendAdminReauthenticationFailure(res, authentication.reason);
        return;
      }
    }
    await withTransaction(async (client) => {
      if (Object.keys(patch).length > 0) {
        await updateAppSettings(req.admin!.adminId, patch, client);
        await createAdminSystemAuditEvent(
          req.admin!.adminId,
          'APP_SETTINGS_CHANGED',
          patch,
          client
        );
      }
      if (revokeAdmin) {
        await incrementAdminSessionVersion(req.admin!.adminId, client);
        await createAdminSystemAuditEvent(
          req.admin!.adminId,
          'SESSIONS_REVOKED',
          { scope: 'admin' },
          client
        );
      }
      if (revokeWorkshop) {
        await incrementAllWorkshopSessionVersions(client);
        await createAdminSystemAuditEvent(
          req.admin!.adminId,
          'SESSIONS_REVOKED',
          { scope: 'workshop' },
          client
        );
      }
      if (revokeBoard) {
        await incrementBoardSessionVersion(req.admin!.adminId, client);
        await createAdminSystemAuditEvent(
          req.admin!.adminId,
          'SESSIONS_REVOKED',
          { scope: 'board' },
          client
        );
      }
    });

    const updated = await getAppSettingsById(req.admin.adminId);
    if (revokeAdmin) clearAuthCookie(res, ADMIN_AUTH_COOKIE);
    res.json(updated);
  } catch (err) {
    handleControllerError(res, 'patchAppSettings', err);
  }
}
