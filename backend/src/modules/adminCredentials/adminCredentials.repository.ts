import pool from '../../db/pool';

export interface AdminCredentialAccount {
  id: number;
  username: string;
  password_hash: string;
}

export async function findAdminByUsername(username: string): Promise<AdminCredentialAccount | null> {
  const { rows } = await pool.query<AdminCredentialAccount>(
    'SELECT id, username, password_hash FROM admin_accounts WHERE username = $1',
    [username]
  );

  return rows[0] ?? null;
}

export async function getAdminPasswordHash(adminId: number): Promise<string | null> {
  const { rows } = await pool.query<{ password_hash: string }>(
    'SELECT password_hash FROM admin_accounts WHERE id = $1',
    [adminId]
  );

  return rows[0]?.password_hash ?? null;
}

export async function updateAdminPasswordHash(adminId: number, passwordHash: string): Promise<boolean> {
  const result = await pool.query(
    'UPDATE admin_accounts SET password_hash = $1 WHERE id = $2',
    [passwordHash, adminId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function getAdminSessionVersion(adminId: number): Promise<number | null> {
  const { rows } = await pool.query<{ session_version: number }>(
    'SELECT session_version FROM admin_accounts WHERE id = $1',
    [adminId]
  );
  return rows[0]?.session_version ?? null;
}

export async function incrementAdminSessionVersion(adminId: number): Promise<boolean> {
  const result = await pool.query(
    'UPDATE admin_accounts SET session_version = session_version + 1 WHERE id = $1',
    [adminId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function getAdminEmailFromDb(adminId: number): Promise<string | null> {
  const { rows } = await pool.query<{ email: string | null }>(
    'SELECT email FROM admin_accounts WHERE id = $1',
    [adminId]
  );
  return rows[0]?.email ?? null;
}

export async function updateAdminEmail(adminId: number, email: string | null): Promise<boolean> {
  const result = await pool.query(
    'UPDATE admin_accounts SET email = $1 WHERE id = $2',
    [email, adminId]
  );
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
  prefs: Partial<AdminNotifPrefs>
): Promise<boolean> {
  const keys = Object.keys(prefs) as (keyof AdminNotifPrefs)[];
  if (keys.length === 0) return false;
  const setClauses = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  const values = keys.map((k) => prefs[k]);
  const result = await pool.query(
    `UPDATE admin_accounts SET ${setClauses} WHERE id = $1`,
    [adminId, ...values]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function getAdminNotifPref(pref: keyof AdminNotifPrefs): Promise<boolean> {
  const { rows } = await pool.query<Pick<AdminNotifPrefs, typeof pref>>(
    `SELECT ${pref} FROM admin_accounts LIMIT 1`
  );
  return rows[0]?.[pref] ?? true;
}

export interface BoardSettings {
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
    `SELECT board_enabled, board_code_hash, board_session_version
     FROM admin_accounts LIMIT 1`
  );
  return rows[0] ?? null;
}

export async function updateBoardEnabled(adminId: number, enabled: boolean): Promise<void> {
  await pool.query(
    `UPDATE admin_accounts SET board_enabled = $1 WHERE id = $2`,
    [enabled, adminId]
  );
}

export async function updateBoardCodeHash(adminId: number, hash: string): Promise<void> {
  await pool.query(
    `UPDATE admin_accounts
     SET board_code_hash = $1, board_session_version = board_session_version + 1
     WHERE id = $2`,
    [hash, adminId]
  );
}

export async function incrementBoardSessionVersion(adminId: number): Promise<void> {
  await pool.query(
    `UPDATE admin_accounts SET board_session_version = board_session_version + 1 WHERE id = $1`,
    [adminId]
  );
}
