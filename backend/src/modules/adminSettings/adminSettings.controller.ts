import { Request, Response } from 'express';
import { sendUnauthenticated } from '../../auth/authResponses';
import { sendError } from '../../utils/errors';
import { handleControllerError } from '../../utils/controller';
import { getAdminNotifPrefs, updateAdminNotifPrefs, AdminNotifPrefs } from '../adminCredentials/adminCredentials.repository';

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
