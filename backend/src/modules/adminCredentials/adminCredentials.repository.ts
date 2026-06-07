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
