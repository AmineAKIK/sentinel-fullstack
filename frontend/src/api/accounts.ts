import { api } from './client';
import { SentinelUser, Role, SortField, SortOrder } from '../types';

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
}

export interface UpdateAccountPayload {
  firstName?: string;
  lastName?: string;
  badgeNumber?: string;
  role?: Role;
}

export async function listAccounts(params: ListAccountsParams = {}): Promise<SentinelUser[]> {
  const qs = new URLSearchParams();
  if (params.role) qs.set('role', params.role);
  if (params.sort) qs.set('sort', params.sort);
  if (params.order) qs.set('order', params.order);
  const query = qs.toString() ? `?${qs.toString()}` : '';
  return api.get<SentinelUser[]>(`/api/admin/accounts${query}`);
}

export async function getAccount(id: number): Promise<SentinelUser> {
  return api.get<SentinelUser>(`/api/admin/accounts/${id}`);
}

export async function createAccount(payload: CreateAccountPayload): Promise<SentinelUser> {
  return api.post<SentinelUser>('/api/admin/accounts', payload);
}

export async function checkBadgeAvailability(badgeNumber: string): Promise<{ exists: boolean }> {
  const query = new URLSearchParams({ badgeNumber }).toString();
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

export async function getAccountImpact(id: number): Promise<{
  reported_incidents: number;
  taken_incidents: number;
}> {
  return api.get(`/api/admin/accounts/${id}/impact`);
}
