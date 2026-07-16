import { api } from './client';
import { SentinelUser, Role, SortField, SortOrder } from '../types';
import { buildQuery, buildRequiredQuery } from '../utils/query';

export interface ListAccountsParams {
  role?: Role | '';
  sort?: SortField;
  order?: SortOrder;
}

export interface CreateAccountPayload {
  firstName: string;
  lastName: string;
  badgeNumber: string;
  role: Role;
  email?: string | null;
}

export interface UpdateAccountPayload {
  firstName?: string;
  lastName?: string;
  badgeNumber?: string;
  role?: Role;
  email?: string | null;
}

export async function listAccounts(
  params: ListAccountsParams = {},
  signal?: AbortSignal
): Promise<SentinelUser[]> {
  return api.get<SentinelUser[]>(`/api/admin/accounts${buildQuery(params)}`, signal);
}

export async function getAccount(id: number, signal?: AbortSignal): Promise<SentinelUser> {
  return api.get<SentinelUser>(`/api/admin/accounts/${id}`, signal);
}

export async function createAccount(payload: CreateAccountPayload): Promise<SentinelUser> {
  return api.post<SentinelUser>('/api/admin/accounts', payload);
}

export async function checkBadgeAvailability(badgeNumber: string): Promise<{ exists: boolean }> {
  const query = buildRequiredQuery({ badgeNumber });
  return api.get<{ exists: boolean }>(`/api/admin/accounts/check-badge?${query}`);
}

export async function updateAccount(
  id: number,
  payload: UpdateAccountPayload
): Promise<SentinelUser> {
  return api.patch<SentinelUser>(`/api/admin/accounts/${id}`, payload);
}

export async function activateAccount(id: number): Promise<SentinelUser> {
  return api.patch<SentinelUser>(`/api/admin/accounts/${id}/activate`);
}

export async function deactivateAccount(id: number): Promise<SentinelUser> {
  return api.patch<SentinelUser>(`/api/admin/accounts/${id}/deactivate`);
}

export async function resetAccountPassword(id: number): Promise<SentinelUser> {
  return api.patch<SentinelUser>(`/api/admin/accounts/${id}/reset-password`);
}

export async function deleteAccount(id: number): Promise<void> {
  return api.delete<void>(`/api/admin/accounts/${id}`);
}

export async function getAccountImpact(
  id: number,
  signal?: AbortSignal
): Promise<{
  reported_incidents: number;
  taken_incidents: number;
  active_taken_incidents: number;
}> {
  return api.get(`/api/admin/accounts/${id}/impact`, signal);
}
