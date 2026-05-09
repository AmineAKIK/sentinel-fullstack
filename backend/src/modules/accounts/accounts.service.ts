import { ErrorCode } from '../../utils/errors';
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

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: ErrorCode; message: string };

export function badRequest(message: string): ServiceResult<never> {
  return { ok: false, status: 400, code: 'VALIDATION_ERROR', message };
}

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

  const created = await createAccountData(input);
  await createAccountAuditEvent(created.id, adminId, 'USER_CREATED', {
    firstName: input.firstName,
    lastName: input.lastName,
    badgeNumber: input.badgeNumber,
    role: input.role,
  });

  return { ok: true, data: created };
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

  const result = await updateAccountData(id, updates);
  if (!result) {
    return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Utilisateur introuvable.' };
  }

  if (Object.keys(result.changes).length > 0) {
    await createAccountAuditEvent(id, adminId, 'USER_UPDATED', result.changes);
  }

  return { ok: true, data: result.account };
}

export async function activateAccountService(id: number, adminId: number): Promise<ServiceResult<AccountDto>> {
  const account = await setAccountActive(id, true);
  if (!account) {
    return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Utilisateur introuvable.' };
  }

  await createAccountAuditEvent(id, adminId, 'USER_ACTIVATED', null);
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

  const account = await setAccountActive(id, false);
  if (!account) {
    return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Utilisateur introuvable.' };
  }

  await createAccountAuditEvent(id, adminId, 'USER_DEACTIVATED', null);
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

  if (!(await softDeleteAccount(id))) {
    return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Utilisateur introuvable.' };
  }

  await createAccountAuditEvent(id, adminId, 'USER_SOFT_DELETED', null);
  return { ok: true, data: { message: 'Utilisateur supprimé.' } };
}

export async function getAccountImpactService(id: number): Promise<AccountImpactDto> {
  return getAccountImpactData(id);
}

export async function resetAccountPasswordService(id: number, adminId: number): Promise<ServiceResult<AccountDto>> {
  const account = await resetAccountPasswordData(id);
  if (!account) {
    return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Utilisateur introuvable.' };
  }

  await createAccountAuditEvent(id, adminId, 'USER_PASSWORD_RESET', null);
  return { ok: true, data: account };
}
