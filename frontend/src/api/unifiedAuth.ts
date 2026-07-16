import { api } from './client';
import { AdminInfo, WorkshopUser, WorkshopPasswordSetupRequired } from '../types';

export interface AdminLoginSuccess extends AdminInfo {
  accountType: 'admin';
}

export interface WorkshopLoginSuccess extends WorkshopUser {
  accountType: 'workshop';
}

export interface PasswordRequired {
  requiresPassword: true;
  badge_number?: string;
}

export type UnifiedLoginResponse =
  | AdminLoginSuccess
  | WorkshopLoginSuccess
  | PasswordRequired
  | WorkshopPasswordSetupRequired;

export async function unifiedLogin(
  identifier: string,
  password?: string,
  newPassword?: string,
  setupCode?: string
): Promise<UnifiedLoginResponse> {
  return api.post<UnifiedLoginResponse>('/api/auth/login', {
    identifier,
    password,
    newPassword,
    setupCode,
  });
}

export type MeResponse = AdminLoginSuccess | WorkshopLoginSuccess;

export async function getUnifiedMe(signal?: AbortSignal): Promise<MeResponse> {
  return api.get<MeResponse>('/api/auth/me', signal);
}

export async function unifiedLogout(): Promise<void> {
  return api.post<void>('/api/auth/logout');
}

export async function requestPasswordReset(badgeNumber: string): Promise<void> {
  await api.post<{ sent: true }>('/api/auth/password-reset/request', { badgeNumber });
}
