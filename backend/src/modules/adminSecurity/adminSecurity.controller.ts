import { Request, Response } from 'express';
import {
  hashAdminPassword,
  MIN_PASSWORD_LENGTH_ADMIN,
  MAX_PASSWORD_LENGTH,
  verifyPassword as verifyPwd,
} from '../../auth/bcrypt';
import { ADMIN_AUTH_COOKIE, clearAuthCookie } from '../../auth/authCookies';
import { sendUnauthenticated } from '../../auth/authResponses';
import { sendError } from '../../utils/errors';
import { handleControllerError } from '../../utils/controller';
import { getAdminPasswordHash, incrementAdminSessionVersion, updateAdminPasswordHash, getAdminEmailFromDb, updateAdminEmail } from '../adminCredentials/adminCredentials.repository';
import { createRateLimit } from '../../utils/inMemoryRateLimit';
import { createAdminSystemAuditEvent } from '../adminAudit/adminAudit.events';

const verifyFailures = createRateLimit(3, 30 * 60 * 1000);

export async function changePassword(req: Request, res: Response): Promise<void> {
  if (!req.admin) {
    sendUnauthenticated(res);
    return;
  }

  const { currentPassword, newPassword } = req.body || {};

  if (!currentPassword || typeof currentPassword !== 'string' || currentPassword.length > MAX_PASSWORD_LENGTH) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Mot de passe actuel requis.');
    return;
  }
  if (
    !newPassword ||
    typeof newPassword !== 'string' ||
    newPassword.length < MIN_PASSWORD_LENGTH_ADMIN ||
    newPassword.length > MAX_PASSWORD_LENGTH
  ) {
    sendError(res, 400, 'VALIDATION_ERROR', `Le nouveau mot de passe doit contenir entre ${MIN_PASSWORD_LENGTH_ADMIN} et ${MAX_PASSWORD_LENGTH} caractères.`);
    return;
  }

  try {
    const passwordHash = await getAdminPasswordHash(req.admin.adminId);
    if (!passwordHash) {
      sendError(res, 401, 'UNAUTHORIZED', 'Non authentifié.');
      return;
    }

    const valid = await verifyPwd(currentPassword, passwordHash);
    if (!valid) {
      sendError(res, 401, 'UNAUTHORIZED', 'Mot de passe actuel incorrect.');
      return;
    }

    const newHash = await hashAdminPassword(newPassword);
    await updateAdminPasswordHash(req.admin.adminId, newHash);
    await incrementAdminSessionVersion(req.admin.adminId);
    await createAdminSystemAuditEvent(req.admin.adminId, 'ADMIN_PASSWORD_CHANGED', null);

    clearAuthCookie(res, ADMIN_AUTH_COOKIE);
    res.json({ message: 'Mot de passe modifié. Reconnectez-vous.' });
  } catch (err) {
    handleControllerError(res, 'changePassword', err);
  }
}

export async function getEmail(req: Request, res: Response): Promise<void> {
  if (!req.admin) { sendUnauthenticated(res); return; }
  try {
    const raw = await getAdminEmailFromDb(req.admin.adminId)
      ?? process.env.ADMIN_EMAIL
      ?? null;
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
  if (!req.admin) { sendUnauthenticated(res); return; }

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
    const [passwordHash, existingEmail] = await Promise.all([
      getAdminPasswordHash(req.admin.adminId),
      getAdminEmailFromDb(req.admin.adminId),
    ]);

    if (!passwordHash) { sendUnauthenticated(res); return; }

    const valid = await verifyPwd(currentPassword, passwordHash);
    if (!valid) {
      sendError(res, 401, 'UNAUTHORIZED', 'Mot de passe incorrect.');
      return;
    }

    const resolvedCurrent = existingEmail ?? process.env.ADMIN_EMAIL ?? null;
    if (resolvedCurrent) {
      const providedCurrent = typeof currentEmail === 'string' ? currentEmail.trim().toLowerCase() : '';
      if (providedCurrent !== resolvedCurrent) {
        sendError(res, 401, 'UNAUTHORIZED', 'Adresse email actuelle incorrecte.');
        return;
      }
    }

    await updateAdminEmail(req.admin.adminId, newEmail || null);
    await createAdminSystemAuditEvent(req.admin.adminId, 'ADMIN_EMAIL_CHANGED', {
      hadEmail: resolvedCurrent !== null,
      cleared: !newEmail,
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
    const passwordHash = await getAdminPasswordHash(req.admin.adminId);
    if (!passwordHash) {
      sendError(res, 401, 'UNAUTHORIZED', 'Non authentifié.');
      return;
    }

    const valid = await verifyPwd(password, passwordHash);
    if (!valid) {
      verifyFailures.increment(req.admin.adminId);
      if (verifyFailures.isExceeded(req.admin.adminId)) {
        verifyFailures.reset(req.admin.adminId);
        clearAuthCookie(res, ADMIN_AUTH_COOKIE);
        sendError(res, 401, 'UNAUTHORIZED', 'Session expirée après trop de tentatives incorrectes.');
        return;
      }
      sendError(res, 401, 'UNAUTHORIZED', 'Mot de passe incorrect.');
      return;
    }

    verifyFailures.reset(req.admin.adminId);
    res.json({ valid: true });
  } catch (err) {
    handleControllerError(res, 'verifyPassword', err);
  }
}
