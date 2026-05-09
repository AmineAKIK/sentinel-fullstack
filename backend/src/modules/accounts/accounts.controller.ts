import { Request, Response } from 'express';
import { sendError } from '../../utils/errors';
import {
  createAccountSchema,
  updateAccountSchema,
} from './accounts.validation';
import { ZodError } from 'zod';
import {
  badRequest,
  checkBadgeAvailabilityService,
  createAccountService,
  deleteAccountService,
  getAccountImpactService,
  getAccountService,
  listAccountsService,
  resetAccountPasswordService,
  ServiceResult,
  activateAccountService,
  deactivateAccountService,
  updateAccountService,
} from './accounts.service';

function formatZodError(err: ZodError): string {
  return err.errors.map((e) => e.message).join(' ');
}

function sendServiceError<T>(
  res: Response,
  result: ServiceResult<T>
): result is Extract<ServiceResult<T>, { ok: false }> {
  if (result.ok) return false;
  sendError(res, result.status, result.code, result.message);
  return true;
}

export async function listAccounts(req: Request, res: Response): Promise<void> {
  try {
    const { role, sort, order } = req.query as {
      role?: string;
      sort?: string;
      order?: string;
    };

    res.json(await listAccountsService({ role, sort, order }));
  } catch (err) {
    console.error('listAccounts error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function checkBadgeAvailability(req: Request, res: Response): Promise<void> {
  try {
    const badgeNumber = String(req.query.badgeNumber || '').trim();
    if (!badgeNumber) {
      sendServiceError(res, badRequest('Numéro de badge requis.'));
      return;
    }

    res.json(await checkBadgeAvailabilityService(badgeNumber));
  } catch (err) {
    console.error('checkBadgeAvailability error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function createAccount(req: Request, res: Response): Promise<void> {
  try {
    const parsed = createAccountSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, 'VALIDATION_ERROR', formatZodError(parsed.error));
      return;
    }

    const result = await createAccountService(parsed.data, req.admin!.adminId);
    if (sendServiceError(res, result)) return;

    res.status(201).json(result.data);
  } catch (err) {
    console.error('createAccount error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function getAccount(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Identifiant invalide.');
      return;
    }

    const result = await getAccountService(id);
    if (sendServiceError(res, result)) return;

    res.json(result.data);
  } catch (err) {
    console.error('getAccount error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function updateAccount(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Identifiant invalide.');
      return;
    }

    const parsed = updateAccountSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, 'VALIDATION_ERROR', formatZodError(parsed.error));
      return;
    }

    const updates = parsed.data;

    if (Object.keys(updates).length === 0) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Aucun champ à mettre à jour.');
      return;
    }

    const result = await updateAccountService(id, updates, req.admin!.adminId);
    if (sendServiceError(res, result)) return;

    res.json(result.data);
  } catch (err) {
    console.error('updateAccount error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function activateAccount(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Identifiant invalide.');
      return;
    }

    const result = await activateAccountService(id, req.admin!.adminId);
    if (sendServiceError(res, result)) return;

    res.json(result.data);
  } catch (err) {
    console.error('activateAccount error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function deactivateAccount(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Identifiant invalide.');
      return;
    }

    const result = await deactivateAccountService(id, req.admin!.adminId);
    if (sendServiceError(res, result)) return;

    res.json(result.data);
  } catch (err) {
    console.error('deactivateAccount error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function deleteAccount(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Identifiant invalide.');
      return;
    }

    const result = await deleteAccountService(id, req.admin!.adminId);
    if (sendServiceError(res, result)) return;

    res.json(result.data);
  } catch (err) {
    console.error('deleteAccount error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function getAccountImpact(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Identifiant invalide.');
      return;
    }

    res.json(await getAccountImpactService(id));
  } catch (err) {
    console.error('getAccountImpact error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}


export async function resetAccountPassword(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Identifiant invalide.');
      return;
    }

    const result = await resetAccountPasswordService(id, req.admin!.adminId);
    if (sendServiceError(res, result)) return;

    res.json(result.data);
  } catch (err) {
    console.error('resetAccountPassword error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}
