import { api } from './client';

export interface AdminNotifPrefs {
  notif_admin: boolean;
  notif_responsables: boolean;
  notif_techniciens: boolean;
  notif_operateurs: boolean;
}

export async function getAdminNotifPrefs(signal?: AbortSignal): Promise<AdminNotifPrefs> {
  return api.get<AdminNotifPrefs>('/api/admin/settings/notifications', signal);
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

export async function getBoardSettings(signal?: AbortSignal): Promise<BoardSettingsResponse> {
  return api.get<BoardSettingsResponse>('/api/admin/settings/board', signal);
}

export async function patchBoardEnabled(
  enabled: boolean,
  currentPassword: string
): Promise<{ board_enabled: boolean }> {
  return api.patch<{ board_enabled: boolean }>('/api/admin/settings/board/toggle', {
    enabled,
    currentPassword,
  });
}

export async function patchBoardCode(payload: {
  newCode: string;
  confirmCode: string;
  currentPassword: string;
}): Promise<{ ok: true }> {
  return api.patch<{ ok: true }>('/api/admin/settings/board/code', payload);
}

export interface AppSettings {
  session_duration_hours: number;
  workshop_session_hours: number;
  board_session_ttl_hours: number;
  login_max_attempts: number;
  setup_code_ttl_hours: number;
  board_label: string;
}

export interface AppSettingsPatch extends Partial<AppSettings> {
  revokeAdminSessions?: boolean;
  revokeWorkshopSessions?: boolean;
  revokeBoardSessions?: boolean;
  // Exigé par l'API dès qu'un flag de révocation est présent.
  currentPassword?: string;
}

export async function getAppSettings(signal?: AbortSignal): Promise<AppSettings> {
  return api.get<AppSettings>('/api/admin/settings/app', signal);
}

export async function patchAppSettings(patch: AppSettingsPatch): Promise<AppSettings> {
  return api.patch<AppSettings>('/api/admin/settings/app', patch);
}
