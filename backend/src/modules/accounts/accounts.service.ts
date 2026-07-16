import { PoolClient } from 'pg';
import { ServiceResult } from '../../utils/serviceResult';
import { isPostgresError } from '../../utils/postgresError';
import { withTransaction } from '../../db/transaction';
import {
  generateWorkshopPasswordSetupCode,
  getWorkshopPasswordSetupExpiry,
  hashWorkshopPasswordSetupCode,
} from '../../auth/setupCode';
import { getAppSettings } from '../adminCredentials/adminCredentials.repository';
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

const badgeConstraints = new Set([
  'idx_sentinel_users_badge_number_active',
  'idx_sentinel_users_normalized_badge_active',
]);

function badgeAlreadyExists(): ServiceResult<never> {
  return {
    ok: false,
    status: 409,
    code: 'BADGE_ALREADY_EXISTS',
    message: 'Ce numéro de badge est déjà utilisé.',
  };
}

function mapBadgeWriteConflict(error: unknown): ServiceResult<never> | null {
  if (
    isPostgresError(error) &&
    error.code === '23505' &&
    error.constraint &&
    badgeConstraints.has(error.constraint)
  ) {
    return badgeAlreadyExists();
  }
  return null;
}

async function guardNoActiveTakenIncidents(
  userId: number,
  action: string,
  client?: PoolClient
): Promise<ServiceResult<never> | null> {
  const count = await getActiveTakenIncidentCountForUser(userId, client);
  if (count > 0) {
    return {
      ok: false,
      status: 409,
      code: 'RESOURCE_IN_USE',
      message: `Impossible de ${action} : ce technicien a ${count} incident${count > 1 ? 's' : ''} actif${count > 1 ? 's' : ''} en cours. Réassignez-les ou clôturez-les avant de continuer.`,
    };
  }
  return null;
}

export async function listAccountsService(filters: ListAccountsFilters): Promise<AccountDto[]> {
  return listAccountsData(filters);
}

export async function checkBadgeAvailabilityService(
  badgeNumber: string
): Promise<{ exists: boolean }> {
  return { exists: await accountBadgeExists(badgeNumber) };
}

export async function createAccountService(
  input: CreateAccountInput,
  adminId: number
): Promise<ServiceResult<AccountDto>> {
  const { setup_code_ttl_hours } = await getAppSettings();
  const setupCode = generateWorkshopPasswordSetupCode();
  const setupExpiresAt = getWorkshopPasswordSetupExpiry(setup_code_ttl_hours);
  const setupCodeHash = await hashWorkshopPasswordSetupCode(setupCode);

  try {
    const result = await withTransaction(async (client) => {
      if (await accountBadgeExists(input.badgeNumber, undefined, client)) {
        return { kind: 'conflict' as const };
      }
      const account = await createAccountData(input, setupCodeHash, setupExpiresAt, client);
      await createAccountAuditEvent(
        account.id,
        adminId,
        'USER_CREATED',
        {
          firstName: input.firstName,
          lastName: input.lastName,
          badgeNumber: input.badgeNumber,
          role: input.role,
          // L'adresse elle-même n'a pas sa place dans le journal d'audit : seule
          // l'existence d'un canal de notification professionnel est pertinente.
          emailConfigured: Boolean(input.email),
        },
        client
      );
      return { kind: 'ok' as const, account };
    });

    if (result.kind === 'conflict') return badgeAlreadyExists();
    return { ok: true, data: { ...result.account, password_setup_code: setupCode } };
  } catch (error) {
    const conflict = mapBadgeWriteConflict(error);
    if (conflict) return conflict;
    throw error;
  }
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
  try {
    const result = await withTransaction(async (client) => {
      const current = await getAccountData(id, client, true);
      if (!current) return { kind: 'not_found' as const };

      const changes: Record<string, unknown> = {};
      if (updates.firstName !== undefined && updates.firstName !== current.first_name)
        changes.firstName = { old: current.first_name, new: updates.firstName };
      if (updates.lastName !== undefined && updates.lastName !== current.last_name)
        changes.lastName = { old: current.last_name, new: updates.lastName };
      if (updates.badgeNumber !== undefined && updates.badgeNumber !== current.badge_number)
        changes.badgeNumber = { old: current.badge_number, new: updates.badgeNumber };
      if (updates.role !== undefined && updates.role !== current.role)
        changes.role = { old: current.role, new: updates.role };
      if (updates.email !== undefined && updates.email !== current.email) {
        changes.email = {
          action: updates.email === null ? 'removed' : current.email ? 'updated' : 'configured',
        };
      }

      if (Object.keys(changes).length === 0) return { kind: 'ok' as const, account: current };

      if (
        updates.badgeNumber !== undefined &&
        updates.badgeNumber !== current.badge_number &&
        (await accountBadgeExists(updates.badgeNumber, id, client))
      ) {
        return { kind: 'conflict' as const };
      }

      if (updates.role !== undefined && updates.role !== current.role) {
        const guard = await guardNoActiveTakenIncidents(id, 'changer le rôle', client);
        if (guard) return { kind: 'guard' as const, error: guard };
      }

      const updated = await updateAccountData(id, updates, client);
      if (!updated) return { kind: 'not_found' as const };
      await createAccountAuditEvent(id, adminId, 'USER_UPDATED', changes, client);
      return { kind: 'ok' as const, account: updated };
    });

    if (result.kind === 'not_found') {
      return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Utilisateur introuvable.' };
    }
    if (result.kind === 'conflict') return badgeAlreadyExists();
    if (result.kind === 'guard') return result.error;
    return { ok: true, data: result.account };
  } catch (error) {
    const conflict = mapBadgeWriteConflict(error);
    if (conflict) return conflict;
    throw error;
  }
}

export async function activateAccountService(
  id: number,
  adminId: number
): Promise<ServiceResult<AccountDto>> {
  const result = await withTransaction(async (client) => {
    const current = await getAccountData(id, client, true);
    if (!current) return { kind: 'not_found' as const };
    if (current.is_active) return { kind: 'ok' as const, account: current };
    const updated = await setAccountActive(id, true, client);
    if (!updated) return { kind: 'not_found' as const };
    await createAccountAuditEvent(id, adminId, 'USER_ACTIVATED', null, client);
    return { kind: 'ok' as const, account: updated };
  });

  if (result.kind === 'not_found') {
    return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Utilisateur introuvable.' };
  }

  return { ok: true, data: result.account };
}

export async function deactivateAccountService(
  id: number,
  adminId: number
): Promise<ServiceResult<AccountDto>> {
  const result = await withTransaction(async (client) => {
    const current = await getAccountData(id, client, true);
    if (!current) return { kind: 'not_found' as const };
    if (!current.is_active) return { kind: 'ok' as const, account: current };
    const guard = await guardNoActiveTakenIncidents(id, 'désactiver cet utilisateur', client);
    if (guard) return { kind: 'guard' as const, error: guard };
    const updated = await setAccountActive(id, false, client);
    if (!updated) return { kind: 'not_found' as const };
    await createAccountAuditEvent(id, adminId, 'USER_DEACTIVATED', null, client);
    return { kind: 'ok' as const, account: updated };
  });

  if (result.kind === 'not_found') {
    return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Utilisateur introuvable.' };
  }
  if (result.kind === 'guard') return result.error;

  return { ok: true, data: result.account };
}

export async function deleteAccountService(
  id: number,
  adminId: number
): Promise<ServiceResult<{ message: string }>> {
  const result = await withTransaction(async (client) => {
    const before = await getAccountData(id, client, true);
    if (!before) return { kind: 'not_found' as const };
    const guard = await guardNoActiveTakenIncidents(id, 'supprimer cet utilisateur', client);
    if (guard) return { kind: 'guard' as const, error: guard };
    const ok = await softDeleteAccount(id, client);
    if (!ok) return { kind: 'not_found' as const };
    await createAccountAuditEvent(id, adminId, 'USER_SOFT_DELETED', null, client, {
      firstName: before.first_name,
      lastName: before.last_name,
      badgeNumber: before.badge_number,
    });
    return { kind: 'ok' as const };
  });

  if (result.kind === 'not_found') {
    return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Utilisateur introuvable.' };
  }
  if (result.kind === 'guard') return result.error;

  return { ok: true, data: { message: 'Utilisateur supprimé.' } };
}

export async function getAccountImpactService(id: number): Promise<AccountImpactDto> {
  return getAccountImpactData(id);
}

export async function resetAccountPasswordService(
  id: number,
  adminId: number
): Promise<ServiceResult<AccountDto>> {
  const { setup_code_ttl_hours } = await getAppSettings();
  const setupCode = generateWorkshopPasswordSetupCode();
  const setupExpiresAt = getWorkshopPasswordSetupExpiry(setup_code_ttl_hours);
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
