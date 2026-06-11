import { api } from './client';

export async function verifyAdminPassword(password: string): Promise<{ valid: boolean }> {
  return api.post<{ valid: boolean }>('/api/admin/security/verify-password', { password });
}
