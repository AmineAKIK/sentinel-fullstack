import { Request, Response } from 'express';
import {
  formatZodError,
  handleControllerError,
  parseIdParam,
  sendServiceError,
} from '../../utils/controller';
import { sendError } from '../../utils/errors';
import { badRequest } from '../../utils/serviceResult';
import { createAccountSchema, updateAccountSchema } from './accounts.validation';
import {
  checkBadgeAvailabilityService,
  createAccountService,
  deleteAccountService,
  getAccountImpactService,
  getAccountService,
  listAccountsService,
  resetAccountPasswordService,
  activateAccountService,
  deactivateAccountService,
  updateAccountService,
} from './accounts.service';

export async function listAccounts(req: Request, res: Response): Promise<void> {
  try {
    const { role, sort, order } = req.query as {
      role?: string;
      sort?: string;
      order?: string;
    };

    res.json(await listAccountsService({ role, sort, order }));
  } catch (err) {
    handleControllerError(res, 'listAccounts', err);
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
    handleControllerError(res, 'checkBadgeAvailability', err);
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
    handleControllerError(res, 'createAccount', err);
  }
}

export async function getAccount(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIdParam(req.params.id);
    if (sendServiceError(res, id)) return;

    const result = await getAccountService(id.data);
    if (sendServiceError(res, result)) return;

    res.json(result.data);
  } catch (err) {
    handleControllerError(res, 'getAccount', err);
  }
}

export async function updateAccount(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIdParam(req.params.id);
    if (sendServiceError(res, id)) return;

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

    const result = await updateAccountService(id.data, updates, req.admin!.adminId);
    if (sendServiceError(res, result)) return;

    res.json(result.data);
  } catch (err) {
    handleControllerError(res, 'updateAccount', err);
  }
}

export async function activateAccount(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIdParam(req.params.id);
    if (sendServiceError(res, id)) return;

    const result = await activateAccountService(id.data, req.admin!.adminId);
    if (sendServiceError(res, result)) return;

    res.json(result.data);
  } catch (err) {
    handleControllerError(res, 'activateAccount', err);
  }
}

export async function deactivateAccount(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIdParam(req.params.id);
    if (sendServiceError(res, id)) return;

    const result = await deactivateAccountService(id.data, req.admin!.adminId);
    if (sendServiceError(res, result)) return;

    res.json(result.data);
  } catch (err) {
    handleControllerError(res, 'deactivateAccount', err);
  }
}

export async function deleteAccount(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIdParam(req.params.id);
    if (sendServiceError(res, id)) return;

    const result = await deleteAccountService(id.data, req.admin!.adminId);
    if (sendServiceError(res, result)) return;

    res.json(result.data);
  } catch (err) {
    handleControllerError(res, 'deleteAccount', err);
  }
}

export async function getAccountImpact(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIdParam(req.params.id);
    if (sendServiceError(res, id)) return;

    res.json(await getAccountImpactService(id.data));
  } catch (err) {
    handleControllerError(res, 'getAccountImpact', err);
  }
}

export async function resetAccountPassword(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIdParam(req.params.id);
    if (sendServiceError(res, id)) return;

    const result = await resetAccountPasswordService(id.data, req.admin!.adminId);
    if (sendServiceError(res, result)) return;

    res.json(result.data);
  } catch (err) {
    handleControllerError(res, 'resetAccountPassword', err);
  }
}
