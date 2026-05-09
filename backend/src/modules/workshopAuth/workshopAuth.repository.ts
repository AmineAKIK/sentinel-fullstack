import pool from '../../db/pool';

export interface WorkshopAuthUser {
  id: number;
  first_name: string;
  last_name: string;
  badge_number: string;
  role: string;
  password_hash: string | null;
}

export async function findActiveWorkshopUserByBadge(badgeNumber: string): Promise<WorkshopAuthUser | null> {
  const { rows } = await pool.query<WorkshopAuthUser>(
    `SELECT id, first_name, last_name, badge_number, role, password_hash
     FROM sentinel_users
     WHERE badge_number = $1 AND is_active = TRUE AND is_deleted = FALSE`,
    [badgeNumber.trim()]
  );

  return rows[0] ?? null;
}

export async function setWorkshopUserPassword(userId: number, passwordHash: string): Promise<void> {
  await pool.query(
    'UPDATE sentinel_users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
    [passwordHash, userId]
  );
}

export async function findActiveWorkshopUserBySession(input: {
  userId: number;
  badgeNumber: string;
}): Promise<Omit<WorkshopAuthUser, 'password_hash'> | null> {
  const { rows } = await pool.query<Omit<WorkshopAuthUser, 'password_hash'>>(
    `SELECT id, first_name, last_name, badge_number, role
     FROM sentinel_users
     WHERE id = $1 AND badge_number = $2 AND is_active = TRUE AND is_deleted = FALSE`,
    [input.userId, input.badgeNumber]
  );

  return rows[0] ?? null;
}
