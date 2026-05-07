import { api } from './client';
import { WorkshopPasswordRequired, WorkshopPasswordSetupRequired, WorkshopUser } from '../types';

export type WorkshopLoginResponse =
  | WorkshopUser
  | WorkshopPasswordRequired
  | WorkshopPasswordSetupRequired;

export async function workshopLogin(
  badgeNumber: string,
  password?: string,
  newPassword?: string
): Promise<WorkshopLoginResponse> {
  return api.post<WorkshopLoginResponse>('/api/workshop/auth/login', {
    badgeNumber,
    password,
    newPassword,
  });
}

export async function workshopLogout(): Promise<void> {
  return api.post<void>('/api/workshop/auth/logout');
}

export async function getWorkshopMe(): Promise<WorkshopUser> {
  return api.get<WorkshopUser>('/api/workshop/auth/me');
}
