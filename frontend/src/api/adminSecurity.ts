import { api } from './client';

export async function verifyAdminPassword(password: string): Promise<{ valid: boolean }> {
  return api.post<{ valid: boolean }>('/api/admin/security/verify-password', { password });
}

export async function changeAdminPassword(
  currentPassword: string,
  newPassword: string
): Promise<{ message: string }> {
  return api.patch<{ message: string }>('/api/admin/security/password', {
    currentPassword,
    newPassword,
  });
}

export interface AdminEmailStatus {
  hasEmail: boolean;
  hint: string | null;
}

export async function getAdminEmail(): Promise<AdminEmailStatus> {
  return api.get<AdminEmailStatus>('/api/admin/security/email');
}

export async function updateAdminEmail(payload: {
  email: string | null;
  currentEmail?: string;
  currentPassword: string;
}): Promise<{ ok: true }> {
  return api.patch<{ ok: true }>('/api/admin/security/email', payload);
}
