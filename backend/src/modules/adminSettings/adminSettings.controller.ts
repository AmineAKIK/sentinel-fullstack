import { Request, Response } from 'express';
import { sendUnauthenticated } from '../../auth/authResponses';
import { sendError } from '../../utils/errors';
import { handleControllerError } from '../../utils/controller';
import {
  getAdminNotifPrefs,
  updateAdminNotifPrefs,
  AdminNotifPrefs,
  getBoardSettings,
  updateBoardEnabled,
  updateBoardCodeHash,
  incrementBoardSessionVersion,
  getAdminPasswordHash,
} from '../adminCredentials/adminCredentials.repository';
import { verifyPassword as verifyPwd, MAX_PASSWORD_LENGTH } from '../../auth/bcrypt';
import { hashBoardCode } from '../board/board.auth';
import { FIELD_LIMITS } from '../../domain/constants';

const BOARD_CODE_MIN = 4;

const PREF_KEYS: (keyof AdminNotifPrefs)[] = [
  'notif_admin',
  'notif_responsables',
  'notif_techniciens',
  'notif_operateurs',
];

export async function getNotifPrefs(req: Request, res: Response): Promise<void> {
  if (!req.admin) { sendUnauthenticated(res); return; }
  try {
    const prefs = await getAdminNotifPrefs(req.admin.adminId);
    res.json(prefs ?? {
      notif_admin: true,
      notif_responsables: true,
      notif_techniciens: true,
      notif_operateurs: true,
    });
  } catch (err) {
    handleControllerError(res, 'getNotifPrefs', err);
  }
}

export async function patchNotifPrefs(req: Request, res: Response): Promise<void> {
  if (!req.admin) { sendUnauthenticated(res); return; }

  const body = req.body || {};
  const patch: Partial<AdminNotifPrefs> = {};

  for (const key of PREF_KEYS) {
    if (key in body) {
      if (typeof body[key] !== 'boolean') {
        sendError(res, 400, 'VALIDATION_ERROR', `${key} doit être un booléen.`);
        return;
      }
      patch[key] = body[key] as boolean;
    }
  }

  if (Object.keys(patch).length === 0) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Aucune préférence à mettre à jour.');
    return;
  }

  try {
    await updateAdminNotifPrefs(req.admin.adminId, patch);
    const updated = await getAdminNotifPrefs(req.admin.adminId);
    res.json(updated);
  } catch (err) {
    handleControllerError(res, 'patchNotifPrefs', err);
  }
}

export async function patchBoardToggle(req: Request, res: Response): Promise<void> {
  if (!req.admin) { sendUnauthenticated(res); return; }
  const { enabled } = req.body || {};
  if (typeof enabled !== 'boolean') {
    sendError(res, 400, 'VALIDATION_ERROR', 'enabled doit être un booléen.');
    return;
  }
  try {
    await updateBoardEnabled(req.admin.adminId, enabled);
    if (!enabled) await incrementBoardSessionVersion(req.admin.adminId);
    const updated = await getBoardSettings(req.admin.adminId);
    res.json({ board_enabled: updated?.board_enabled ?? true });
  } catch (err) {
    handleControllerError(res, 'patchBoardToggle', err);
  }
}

export async function patchBoardCode(req: Request, res: Response): Promise<void> {
  if (!req.admin) { sendUnauthenticated(res); return; }
  const { newCode, confirmCode, currentPassword } = req.body || {};

  if (!currentPassword || typeof currentPassword !== 'string' || currentPassword.length > MAX_PASSWORD_LENGTH) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Mot de passe actuel requis.');
    return;
  }
  if (typeof newCode !== 'string' || newCode.trim().length === 0) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Nouveau code requis.');
    return;
  }
  const trimmed = newCode.trim();
  if (trimmed.length < BOARD_CODE_MIN) {
    sendError(res, 400, 'VALIDATION_ERROR', `Le code board doit contenir au moins ${BOARD_CODE_MIN} caractères.`);
    return;
  }
  if (trimmed.length > FIELD_LIMITS.CODE) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Code board trop long.');
    return;
  }
  if (trimmed !== (typeof confirmCode === 'string' ? confirmCode.trim() : '')) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Les deux codes ne correspondent pas.');
    return;
  }
  try {
    const passwordHash = await getAdminPasswordHash(req.admin.adminId);
    if (!passwordHash) { sendUnauthenticated(res); return; }
    const valid = await verifyPwd(currentPassword, passwordHash);
    if (!valid) {
      sendError(res, 401, 'UNAUTHORIZED', 'Mot de passe incorrect.');
      return;
    }
    await updateBoardCodeHash(req.admin.adminId, hashBoardCode(trimmed));
    res.json({ ok: true });
  } catch (err) {
    handleControllerError(res, 'patchBoardCode', err);
  }
}

export async function getBoardSettingsHandler(req: Request, res: Response): Promise<void> {
  if (!req.admin) { sendUnauthenticated(res); return; }
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

export async function patchBoardSettingsHandler(req: Request, res: Response): Promise<void> {
  if (!req.admin) { sendUnauthenticated(res); return; }

  const { enabled, newCode, confirmCode, currentPassword } = req.body || {};

  if (!currentPassword || typeof currentPassword !== 'string' || currentPassword.length > MAX_PASSWORD_LENGTH) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Mot de passe actuel requis.');
    return;
  }

  const hasEnabledChange = typeof enabled === 'boolean';
  const hasCodeChange = typeof newCode === 'string' && newCode.trim().length > 0;

  if (!hasEnabledChange && !hasCodeChange) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Aucune modification à appliquer.');
    return;
  }

  if (hasCodeChange) {
    const trimmed = newCode.trim();
    if (trimmed.length < BOARD_CODE_MIN) {
      sendError(res, 400, 'VALIDATION_ERROR', `Le code board doit contenir au moins ${BOARD_CODE_MIN} caractères.`);
      return;
    }
    if (trimmed.length > FIELD_LIMITS.CODE) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Code board trop long.');
      return;
    }
    if (trimmed !== (typeof confirmCode === 'string' ? confirmCode.trim() : '')) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Les deux codes ne correspondent pas.');
      return;
    }
  }

  try {
    const passwordHash = await getAdminPasswordHash(req.admin.adminId);
    if (!passwordHash) { sendUnauthenticated(res); return; }

    const valid = await verifyPwd(currentPassword, passwordHash);
    if (!valid) {
      sendError(res, 401, 'UNAUTHORIZED', 'Mot de passe incorrect.');
      return;
    }

    if (hasEnabledChange) {
      await updateBoardEnabled(req.admin.adminId, enabled as boolean);
      if (!(enabled as boolean)) {
        await incrementBoardSessionVersion(req.admin.adminId);
      }
    }

    if (hasCodeChange) {
      await updateBoardCodeHash(req.admin.adminId, hashBoardCode(newCode.trim()));
    }

    const updated = await getBoardSettings(req.admin.adminId);
    res.json({
      board_enabled: updated?.board_enabled ?? true,
      hasCode: !!(updated?.board_code_hash || process.env.BOARD_ACCESS_CODE_HASH),
    });
  } catch (err) {
    handleControllerError(res, 'patchBoardSettings', err);
  }
}
