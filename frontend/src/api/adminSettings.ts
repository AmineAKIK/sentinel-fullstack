import { api } from './client';

export interface AdminNotifPrefs {
  notif_admin: boolean;
  notif_responsables: boolean;
  notif_techniciens: boolean;
  notif_operateurs: boolean;
}

export async function getAdminNotifPrefs(): Promise<AdminNotifPrefs> {
  return api.get<AdminNotifPrefs>('/api/admin/settings/notifications');
}

export async function patchAdminNotifPrefs(
  patch: Partial<AdminNotifPrefs>
): Promise<AdminNotifPrefs> {
  return api.patch<AdminNotifPrefs>('/api/admin/settings/notifications', patch);
}

export interface BoardSettingsResponse {
  board_enabled: boolean;
  hasCode: boolean;
}

export async function getBoardSettings(): Promise<BoardSettingsResponse> {
  return api.get<BoardSettingsResponse>('/api/admin/settings/board');
}

export async function patchBoardSettings(payload: {
  enabled?: boolean;
  newCode?: string;
  confirmCode?: string;
  currentPassword: string;
}): Promise<BoardSettingsResponse> {
  return api.patch<BoardSettingsResponse>('/api/admin/settings/board', payload);
}
