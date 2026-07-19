import { Request, Response } from 'express';
import {
  hashAdminPassword,
  MIN_PASSWORD_LENGTH_ADMIN,
  MAX_PASSWORD_LENGTH,
} from '../../auth/bcrypt';
import { ADMIN_AUTH_COOKIE, clearAuthCookie } from '../../auth/authCookies';
import { sendUnauthenticated } from '../../auth/authResponses';
import { sendError } from '../../utils/errors';
import { handleControllerError } from '../../utils/controller';
import {
  incrementAdminSessionVersion,
  updateAdminPasswordHash,
  getAdminEmailFromDb,
  updateAdminEmail,
} from '../adminCredentials/adminCredentials.repository';
import { createAdminSystemAuditEvent } from '../adminAudit/adminAudit.events';
import { withTransaction } from '../../db/transaction';
import { reauthenticateAdmin } from './adminReauthentication.service';
import { sendAdminReauthenticationFailure } from './adminReauthentication.http';

export async function changePassword(req: Request, res: Response): Promise<void> {
  if (!req.admin) {
    sendUnauthenticated(res);
    return;
  }

  const { currentPassword, newPassword } = req.body || {};

  if (
    !currentPassword ||
    typeof currentPassword !== 'string' ||
    currentPassword.length > MAX_PASSWORD_LENGTH
  ) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Mot de passe actuel requis.');
    return;
  }
  if (
    !newPassword ||
    typeof newPassword !== 'string' ||
    newPassword.length < MIN_PASSWORD_LENGTH_ADMIN ||
    newPassword.length > MAX_PASSWORD_LENGTH
  ) {
    sendError(
      res,
      400,
      'VALIDATION_ERROR',
      `Le nouveau mot de passe doit contenir entre ${MIN_PASSWORD_LENGTH_ADMIN} et ${MAX_PASSWORD_LENGTH} caractères.`
    );
    return;
  }

  try {
    const authentication = await reauthenticateAdmin(req.admin.adminId, currentPassword);
    if (!authentication.ok) {
      sendAdminReauthenticationFailure(res, authentication.reason);
      return;
    }

    const newHash = await hashAdminPassword(newPassword);
    await withTransaction(async (client) => {
      const updated = await updateAdminPasswordHash(req.admin!.adminId, newHash, client);
      if (!updated) throw new Error('Compte administrateur introuvable pendant la mise à jour.');
      await incrementAdminSessionVersion(req.admin!.adminId, client);
      await createAdminSystemAuditEvent(req.admin!.adminId, 'ADMIN_PASSWORD_CHANGED', null, client);
    });

    clearAuthCookie(res, ADMIN_AUTH_COOKIE);
    res.json({ message: 'Mot de passe modifié. Reconnectez-vous.' });
  } catch (err) {
    handleControllerError(res, 'changePassword', err);
  }
}

export async function getEmail(req: Request, res: Response): Promise<void> {
  if (!req.admin) {
    sendUnauthenticated(res);
    return;
  }
  try {
    const raw = (await getAdminEmailFromDb(req.admin.adminId)) ?? process.env.ADMIN_EMAIL ?? null;
    if (!raw) {
      res.json({ hasEmail: false, hint: null });
      return;
    }
    const [local, domain] = raw.split('@');
    const hint = `${local.slice(0, 2)}${'*'.repeat(Math.max(local.length - 2, 1))}@${domain}`;
    res.json({ hasEmail: true, hint });
  } catch (err) {
    handleControllerError(res, 'getEmail', err);
  }
}

export async function updateEmail(req: Request, res: Response): Promise<void> {
  if (!req.admin) {
    sendUnauthenticated(res);
    return;
  }

  const { email, currentEmail, currentPassword } = req.body || {};

  if (!currentPassword || typeof currentPassword !== 'string') {
    sendError(res, 400, 'VALIDATION_ERROR', 'Mot de passe actuel requis.');
    return;
  }

  const newEmail = typeof email === 'string' ? email.trim().toLowerCase() : null;
  if (newEmail && (newEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail))) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Nouvelle adresse email invalide.');
    return;
  }

  try {
    const [authentication, existingEmail] = await Promise.all([
      reauthenticateAdmin(req.admin.adminId, currentPassword),
      getAdminEmailFromDb(req.admin.adminId),
    ]);

    if (!authentication.ok) {
      sendAdminReauthenticationFailure(res, authentication.reason);
      return;
    }

    const resolvedCurrent = existingEmail ?? process.env.ADMIN_EMAIL ?? null;
    if (resolvedCurrent) {
      const providedCurrent =
        typeof currentEmail === 'string' ? currentEmail.trim().toLowerCase() : '';
      if (providedCurrent !== resolvedCurrent) {
        sendError(res, 400, 'VALIDATION_ERROR', 'Adresse email actuelle incorrecte.');
        return;
      }
    }

    await withTransaction(async (client) => {
      const updated = await updateAdminEmail(req.admin!.adminId, newEmail || null, client);
      if (!updated) throw new Error('Compte administrateur introuvable pendant la mise à jour.');
      await createAdminSystemAuditEvent(
        req.admin!.adminId,
        'ADMIN_EMAIL_CHANGED',
        {
          hadEmail: resolvedCurrent !== null,
          cleared: !newEmail,
        },
        client
      );
    });
    res.json({ ok: true });
  } catch (err) {
    handleControllerError(res, 'updateEmail', err);
  }
}

export async function verifyPassword(req: Request, res: Response): Promise<void> {
  if (!req.admin) {
    sendUnauthenticated(res);
    return;
  }

  const { password } = req.body || {};
  if (!password || typeof password !== 'string' || password.length > MAX_PASSWORD_LENGTH) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Mot de passe requis.');
    return;
  }

  try {
    const authentication = await reauthenticateAdmin(req.admin.adminId, password);
    if (!authentication.ok) {
      sendAdminReauthenticationFailure(res, authentication.reason);
      return;
    }
    res.json({ valid: true });
  } catch (err) {
    handleControllerError(res, 'verifyPassword', err);
  }
}
