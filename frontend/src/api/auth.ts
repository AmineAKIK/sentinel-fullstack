import { api } from './client';
import { AdminInfo } from '../types';

export async function login(username: string, password: string): Promise<AdminInfo> {
  return api.post<AdminInfo>('/api/admin/auth/login', { username, password });
}

export async function getMe(): Promise<AdminInfo> {
  return api.get<AdminInfo>('/api/admin/auth/me');
}

export async function logout(): Promise<void> {
  return api.post<void>('/api/admin/auth/logout');
}

export async function verifyAdminPassword(password: string): Promise<{ valid: boolean }> {
  return api.post<{ valid: boolean }>('/api/admin/auth/verify-password', { password });
}
