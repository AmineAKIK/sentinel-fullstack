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
