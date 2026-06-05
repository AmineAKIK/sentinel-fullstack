import { badRequest, ServiceResult } from '../../utils/serviceResult';
import { withTransaction } from '../../db/transaction';
import {
  generateWorkshopPasswordSetupCode,
  getWorkshopPasswordSetupExpiry,
  hashWorkshopPasswordSetupCode,
} from '../../auth/setupCode';
import { createAccountAuditEvent } from './accounts.events';
import {
  accountBadgeExists,
  AccountDto,
  AccountImpactDto,
  createAccountData,
  getAccountData,
  getAccountImpactData,
  getActiveTakenIncidentCountForUser,
  ListAccountsFilters,
  listAccountsData,
  resetAccountPasswordData,
  setAccountActive,
  softDeleteAccount,
  updateAccountData,
} from './accounts.repository';
import { CreateAccountInput, UpdateAccountInput } from './accounts.validation';

export async function listAccountsService(filters: ListAccountsFilters): Promise<AccountDto[]> {
  return listAccountsData(filters);
}

export async function checkBadgeAvailabilityService(badgeNumber: string): Promise<{ exists: boolean }> {
  return { exists: await accountBadgeExists(badgeNumber) };
}

export async function createAccountService(input: CreateAccountInput, adminId: number): Promise<ServiceResult<AccountDto>> {
  if (await accountBadgeExists(input.badgeNumber)) {
    return { ok: false, status: 409, code: 'BADGE_ALREADY_EXISTS', message: 'Ce numéro de badge est déjà utilisé.' };
  }

  const setupCode = generateWorkshopPasswordSetupCode();
  const setupExpiresAt = getWorkshopPasswordSetupExpiry();
  const setupCodeHash = await hashWorkshopPasswordSetupCode(setupCode);

  const created = await withTransaction(async (client) => {
    const account = await createAccountData(input, setupCodeHash, setupExpiresAt, client);
    await createAccountAuditEvent(account.id, adminId, 'USER_CREATED', {
      firstName: input.firstName,
      lastName: input.lastName,
      badgeNumber: input.badgeNumber,
      role: input.role,
    }, client);
    return account;
  });

  return { ok: true, data: { ...created, password_setup_code: setupCode } };
}

export async function getAccountService(id: number): Promise<ServiceResult<AccountDto>> {
  const account = await getAccountData(id);
  if (!account) {
    return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Utilisateur introuvable.' };
  }

  return { ok: true, data: account };
}

export async function updateAccountService(
  id: number,
  updates: UpdateAccountInput,
  adminId: number
): Promise<ServiceResult<AccountDto>> {
  const current = await getAccountData(id);
  if (!current) {
    return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Utilisateur introuvable.' };
  }

  if (updates.badgeNumber && updates.badgeNumber !== current.badge_number) {
    if (await accountBadgeExists(updates.badgeNumber, id)) {
      return { ok: false, status: 409, code: 'BADGE_ALREADY_EXISTS', message: 'Ce numéro de badge est déjà utilisé.' };
    }
  }

  if (updates.role !== undefined && updates.role !== current.role) {
    const activeTakenIncidents = await getActiveTakenIncidentCountForUser(id);
    if (activeTakenIncidents > 0) {
      return {
        ok: false,
        status: 409,
        code: 'RESOURCE_IN_USE',
        message: `Impossible de changer le rôle : ${activeTakenIncidents} incident(s) actif(s) sont encore pris en charge par cet utilisateur.`,
      };
    }
  }

  const changes: Record<string, { old: unknown; new: unknown }> = {};
  if (updates.firstName !== undefined && updates.firstName !== current.first_name) changes.firstName = { old: current.first_name, new: updates.firstName };
  if (updates.lastName !== undefined && updates.lastName !== current.last_name) changes.lastName = { old: current.last_name, new: updates.lastName };
  if (updates.badgeNumber !== undefined && updates.badgeNumber !== current.badge_number) changes.badgeNumber = { old: current.badge_number, new: updates.badgeNumber };
  if (updates.role !== undefined && updates.role !== current.role) changes.role = { old: current.role, new: updates.role };

  const account = await withTransaction(async (client) => {
    const updated = await updateAccountData(id, updates, client);
    if (updated && Object.keys(changes).length > 0) {
      await createAccountAuditEvent(id, adminId, 'USER_UPDATED', changes, client);
    }
    return updated;
  });

  if (!account) {
    return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Utilisateur introuvable.' };
  }

  return { ok: true, data: account };
}

export async function activateAccountService(id: number, adminId: number): Promise<ServiceResult<AccountDto>> {
  const account = await withTransaction(async (client) => {
    const updated = await setAccountActive(id, true, client);
    if (!updated) return null;
    await createAccountAuditEvent(id, adminId, 'USER_ACTIVATED', null, client);
    return updated;
  });

  if (!account) {
    return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Utilisateur introuvable.' };
  }

  return { ok: true, data: account };
}

export async function deactivateAccountService(id: number, adminId: number): Promise<ServiceResult<AccountDto>> {
  const activeTakenIncidents = await getActiveTakenIncidentCountForUser(id);
  if (activeTakenIncidents > 0) {
    return {
      ok: false,
      status: 409,
      code: 'RESOURCE_IN_USE',
      message: `Impossible de désactiver cet utilisateur : ${activeTakenIncidents} incident(s) actif(s) sont encore pris en charge par lui.`,
    };
  }

  const account = await withTransaction(async (client) => {
    const updated = await setAccountActive(id, false, client);
    if (!updated) return null;
    await createAccountAuditEvent(id, adminId, 'USER_DEACTIVATED', null, client);
    return updated;
  });

  if (!account) {
    return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Utilisateur introuvable.' };
  }

  return { ok: true, data: account };
}

export async function deleteAccountService(id: number, adminId: number): Promise<ServiceResult<{ message: string }>> {
  const activeTakenIncidents = await getActiveTakenIncidentCountForUser(id);
  if (activeTakenIncidents > 0) {
    return {
      ok: false,
      status: 409,
      code: 'RESOURCE_IN_USE',
      message: `Impossible de supprimer cet utilisateur : ${activeTakenIncidents} incident(s) actif(s) sont encore pris en charge par lui.`,
    };
  }

  const deleted = await withTransaction(async (client) => {
    const ok = await softDeleteAccount(id, client);
    if (!ok) return false;
    await createAccountAuditEvent(id, adminId, 'USER_SOFT_DELETED', null, client);
    return true;
  });

  if (!deleted) {
    return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Utilisateur introuvable.' };
  }

  return { ok: true, data: { message: 'Utilisateur supprimé.' } };
}

export async function getAccountImpactService(id: number): Promise<AccountImpactDto> {
  return getAccountImpactData(id);
}

export async function resetAccountPasswordService(id: number, adminId: number): Promise<ServiceResult<AccountDto>> {
  const setupCode = generateWorkshopPasswordSetupCode();
  const setupExpiresAt = getWorkshopPasswordSetupExpiry();
  const setupCodeHash = await hashWorkshopPasswordSetupCode(setupCode);

  const account = await withTransaction(async (client) => {
    const updated = await resetAccountPasswordData(id, setupCodeHash, setupExpiresAt, client);
    if (!updated) return null;
    await createAccountAuditEvent(id, adminId, 'USER_PASSWORD_RESET', null, client);
    return updated;
  });

  if (!account) {
    return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Utilisateur introuvable.' };
  }

  return { ok: true, data: { ...account, password_setup_code: setupCode } };
}
