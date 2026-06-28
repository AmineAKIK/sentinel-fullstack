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

export async function getAdminEmail(): Promise<{ email: string | null }> {
  return api.get<{ email: string | null }>('/api/admin/security/email');
}

export async function updateAdminEmail(email: string | null): Promise<{ email: string | null }> {
  return api.patch<{ email: string | null }>('/api/admin/security/email', { email });
}
