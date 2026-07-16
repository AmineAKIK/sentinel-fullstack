import pool from '../../db/pool';
import type { PoolClient } from 'pg';

export interface AdminCredentialAccount {
  id: number;
  username: string;
  password_hash: string;
}

export async function findAdminByUsername(
  username: string
): Promise<AdminCredentialAccount | null> {
  const { rows } = await pool.query<AdminCredentialAccount>(
    'SELECT id, username, password_hash FROM admin_accounts WHERE username = $1',
    [username]
  );

  return rows[0] ?? null;
}

export async function getAdminPasswordHash(
  adminId: number,
  client?: PoolClient
): Promise<string | null> {
  const db = client ?? pool;
  const { rows } = await db.query<{ password_hash: string }>(
    'SELECT password_hash FROM admin_accounts WHERE id = $1',
    [adminId]
  );

  return rows[0]?.password_hash ?? null;
}

export async function updateAdminPasswordHash(
  adminId: number,
  passwordHash: string,
  client?: PoolClient
): Promise<boolean> {
  const db = client ?? pool;
  const result = await db.query('UPDATE admin_accounts SET password_hash = $1 WHERE id = $2', [
    passwordHash,
    adminId,
  ]);
  return (result.rowCount ?? 0) > 0;
}

export async function getAdminSessionVersion(adminId: number): Promise<number | null> {
  const { rows } = await pool.query<{ session_version: number }>(
    'SELECT session_version FROM admin_accounts WHERE id = $1',
    [adminId]
  );
  return rows[0]?.session_version ?? null;
}

export async function incrementAdminSessionVersion(
  adminId: number,
  client?: PoolClient
): Promise<boolean> {
  const db = client ?? pool;
  const result = await db.query(
    'UPDATE admin_accounts SET session_version = session_version + 1 WHERE id = $1',
    [adminId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function getAdminEmailFromDb(
  adminId: number,
  client?: PoolClient
): Promise<string | null> {
  const db = client ?? pool;
  const { rows } = await db.query<{ email: string | null }>(
    'SELECT email FROM admin_accounts WHERE id = $1',
    [adminId]
  );
  return rows[0]?.email ?? null;
}

export async function updateAdminEmail(
  adminId: number,
  email: string | null,
  client?: PoolClient
): Promise<boolean> {
  const db = client ?? pool;
  const result = await db.query('UPDATE admin_accounts SET email = $1 WHERE id = $2', [
    email,
    adminId,
  ]);
  return (result.rowCount ?? 0) > 0;
}

export interface AdminNotifPrefs {
  notif_admin: boolean;
  notif_responsables: boolean;
  notif_techniciens: boolean;
  notif_operateurs: boolean;
}

export async function getAdminNotifPrefs(adminId: number): Promise<AdminNotifPrefs | null> {
  const { rows } = await pool.query<AdminNotifPrefs>(
    `SELECT notif_admin, notif_responsables, notif_techniciens, notif_operateurs
     FROM admin_accounts WHERE id = $1`,
    [adminId]
  );
  return rows[0] ?? null;
}

export async function updateAdminNotifPrefs(
  adminId: number,
  prefs: Partial<AdminNotifPrefs>,
  client?: PoolClient
): Promise<boolean> {
  const keys = Object.keys(prefs) as (keyof AdminNotifPrefs)[];
  if (keys.length === 0) return false;
  const setClauses = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  const values = keys.map((k) => prefs[k]);
  const db = client ?? pool;
  const result = await db.query(`UPDATE admin_accounts SET ${setClauses} WHERE id = $1`, [
    adminId,
    ...values,
  ]);
  return (result.rowCount ?? 0) > 0;
}

export async function getAdminNotifPref(pref: keyof AdminNotifPrefs): Promise<boolean> {
  const { rows } = await pool.query<Pick<AdminNotifPrefs, typeof pref>>(
    `SELECT ${pref} FROM admin_accounts LIMIT 1`
  );
  return rows[0]?.[pref] ?? true;
}

export interface BoardSettings {
  id?: number;
  board_enabled: boolean;
  board_code_hash: string | null;
  board_session_version: number;
}

export async function getBoardSettings(adminId: number): Promise<BoardSettings | null> {
  const { rows } = await pool.query<BoardSettings>(
    `SELECT board_enabled, board_code_hash, board_session_version
     FROM admin_accounts WHERE id = $1`,
    [adminId]
  );
  return rows[0] ?? null;
}

export async function getBoardSettingsGlobal(): Promise<BoardSettings | null> {
  const { rows } = await pool.query<BoardSettings>(
    `SELECT id, board_enabled, board_code_hash, board_session_version
     FROM admin_accounts ORDER BY id ASC LIMIT 1`
  );
  return rows[0] ?? null;
}

export async function upgradeBoardCodeHash(adminId: number, hash: string): Promise<void> {
  await pool.query(
    `UPDATE admin_accounts SET board_code_hash = $1, updated_at = NOW() WHERE id = $2`,
    [hash, adminId]
  );
}

export async function updateBoardEnabled(
  adminId: number,
  enabled: boolean,
  client?: PoolClient
): Promise<void> {
  const db = client ?? pool;
  await db.query(`UPDATE admin_accounts SET board_enabled = $1 WHERE id = $2`, [enabled, adminId]);
}

export async function updateBoardCodeHash(
  adminId: number,
  hash: string,
  client?: PoolClient
): Promise<void> {
  const db = client ?? pool;
  await db.query(
    `UPDATE admin_accounts
     SET board_code_hash = $1, board_session_version = board_session_version + 1
     WHERE id = $2`,
    [hash, adminId]
  );
}

export async function incrementBoardSessionVersion(
  adminId: number,
  client?: PoolClient
): Promise<void> {
  const db = client ?? pool;
  await db.query(
    `UPDATE admin_accounts SET board_session_version = board_session_version + 1 WHERE id = $1`,
    [adminId]
  );
}

export interface AppSettings {
  session_duration_hours: number;
  workshop_session_hours: number;
  board_session_ttl_hours: number;
  login_max_attempts: number;
  setup_code_ttl_hours: number;
  board_label: string;
}

const APP_SETTINGS_DEFAULTS: AppSettings = {
  session_duration_hours: 8,
  workshop_session_hours: 8,
  board_session_ttl_hours: 12,
  login_max_attempts: 10,
  setup_code_ttl_hours: 24,
  board_label: 'Board atelier',
};

const SELECT_APP_SETTINGS = `
  SELECT session_duration_hours, workshop_session_hours, board_session_ttl_hours,
         login_max_attempts, setup_code_ttl_hours, board_label`;

export async function getAppSettings(): Promise<AppSettings> {
  const { rows } = await pool.query<AppSettings>(
    `${SELECT_APP_SETTINGS} FROM admin_accounts ORDER BY id ASC LIMIT 1`
  );
  return rows[0] ?? APP_SETTINGS_DEFAULTS;
}

export async function getAppSettingsById(adminId: number): Promise<AppSettings> {
  const { rows } = await pool.query<AppSettings>(
    `${SELECT_APP_SETTINGS} FROM admin_accounts WHERE id = $1`,
    [adminId]
  );
  return rows[0] ?? APP_SETTINGS_DEFAULTS;
}

const APP_SETTINGS_KEYS: (keyof AppSettings)[] = [
  'session_duration_hours',
  'workshop_session_hours',
  'board_session_ttl_hours',
  'login_max_attempts',
  'setup_code_ttl_hours',
  'board_label',
];

export async function updateAppSettings(
  adminId: number,
  patch: Partial<AppSettings>,
  client?: PoolClient
): Promise<void> {
  const keys = (Object.keys(patch) as (keyof AppSettings)[]).filter((k) =>
    APP_SETTINGS_KEYS.includes(k)
  );
  if (keys.length === 0) return;
  const setClauses = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  const values = keys.map((k) => patch[k]);
  const db = client ?? pool;
  await db.query(`UPDATE admin_accounts SET ${setClauses} WHERE id = $1`, [adminId, ...values]);
}

export async function getWorkshopSessionVersion(userId: number): Promise<number | null> {
  const { rows } = await pool.query<{ session_version: number }>(
    'SELECT session_version FROM sentinel_users WHERE id = $1 AND is_deleted = FALSE',
    [userId]
  );
  return rows[0]?.session_version ?? null;
}

export async function incrementAllWorkshopSessionVersions(client?: PoolClient): Promise<void> {
  const db = client ?? pool;
  await db.query(
    'UPDATE sentinel_users SET session_version = session_version + 1 WHERE is_deleted = FALSE'
  );
}
