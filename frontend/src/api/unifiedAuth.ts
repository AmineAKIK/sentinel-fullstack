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

export async function getUnifiedMe(): Promise<MeResponse> {
  return api.get<MeResponse>('/api/auth/me');
}

export async function unifiedLogout(): Promise<void> {
  return api.post<void>('/api/auth/logout');
}
