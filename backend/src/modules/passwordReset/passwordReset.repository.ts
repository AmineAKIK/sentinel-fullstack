import { PoolClient } from 'pg';
import pool from '../../db/pool';

export interface UserForReset {
  id: number;
  first_name: string;
  last_name: string;
  badge_number: string;
}

export async function findActiveUserByBadge(
  badgeNumber: string,
  client?: PoolClient,
  forUpdate = false
): Promise<UserForReset | null> {
  const db = client ?? pool;
  const { rows } = await db.query<UserForReset>(
    `SELECT id, first_name, last_name, badge_number
     FROM sentinel_users
     WHERE lower(btrim(badge_number)) = lower(btrim($1))
       AND is_active = TRUE
       AND is_deleted = FALSE
       AND password_hash IS NOT NULL
     ${forUpdate ? 'FOR UPDATE' : ''}`,
    [badgeNumber]
  );
  return rows[0] ?? null;
}

export async function insertPasswordResetRequest(
  userId: number,
  badgeNumber: string,
  client?: PoolClient
): Promise<number> {
  const db = client ?? pool;
  await db.query(
    `UPDATE password_reset_requests
     SET handled_at = NOW()
     WHERE user_id = $1 AND handled_at IS NULL`,
    [userId]
  );
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO password_reset_requests (user_id, badge_number)
     VALUES ($1, $2)
     RETURNING id`,
    [userId, badgeNumber]
  );
  return rows[0].id;
}
