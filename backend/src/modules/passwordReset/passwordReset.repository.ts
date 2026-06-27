import pool from '../../db/pool';

export interface UserForReset {
  id: number;
  first_name: string;
  last_name: string;
  badge_number: string;
}

export async function findActiveUserByBadge(badgeNumber: string): Promise<UserForReset | null> {
  const { rows } = await pool.query<UserForReset>(
    `SELECT id, first_name, last_name, badge_number
     FROM sentinel_users
     WHERE badge_number = $1
       AND is_active = TRUE
       AND is_deleted = FALSE
       AND password_hash IS NOT NULL`,
    [badgeNumber]
  );
  return rows[0] ?? null;
}

export async function insertPasswordResetRequest(userId: number, badgeNumber: string): Promise<void> {
  await pool.query(
    `INSERT INTO password_reset_requests (user_id, badge_number) VALUES ($1, $2)`,
    [userId, badgeNumber]
  );
}
