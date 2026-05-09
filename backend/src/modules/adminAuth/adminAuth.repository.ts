import pool from '../../db/pool';

export interface AdminAuthAccount {
  id: number;
  username: string;
  password_hash: string;
}

export async function findAdminByUsername(username: string): Promise<AdminAuthAccount | null> {
  const { rows } = await pool.query<AdminAuthAccount>(
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
