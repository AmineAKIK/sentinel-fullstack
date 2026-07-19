import pool from '../../db/pool';

export interface WorkshopCredentialUser {
  id: number;
  first_name: string;
  last_name: string;
  badge_number: string;
  role: string;
  session_version: number;
  password_hash: string | null;
  password_setup_token_hash: string | null;
  password_setup_expires_at: Date | null;
}

export type WorkshopSessionUser = Pick<
  WorkshopCredentialUser,
  'id' | 'first_name' | 'last_name' | 'badge_number' | 'role'
>;

export type WorkshopLoginUser = Pick<
  WorkshopCredentialUser,
  'id' | 'first_name' | 'last_name' | 'badge_number' | 'role' | 'session_version'
>;

export async function findWorkshopUserByBadge(
  badgeNumber: string
): Promise<(WorkshopCredentialUser & { is_active: boolean }) | null> {
  const { rows } = await pool.query<WorkshopCredentialUser & { is_active: boolean }>(
    `SELECT id, first_name, last_name, badge_number, role, is_active, session_version,
            password_hash, password_setup_token_hash, password_setup_expires_at
     FROM sentinel_users
     WHERE lower(btrim(badge_number)) = lower(btrim($1)) AND is_deleted = FALSE`,
    [badgeNumber.trim()]
  );

  return rows[0] ?? null;
}

export async function consumeWorkshopPasswordSetupCode(input: {
  userId: number;
  passwordHash: string;
  expectedSetupTokenHash: string;
}): Promise<WorkshopLoginUser | null> {
  const { rows } = await pool.query<WorkshopLoginUser>(
    `UPDATE sentinel_users
     SET password_hash = $2,
         password_setup_token_hash = NULL,
         password_setup_expires_at = NULL,
         updated_at = NOW()
     WHERE id = $1
       AND is_active = TRUE
       AND is_deleted = FALSE
       AND password_hash IS NULL
       AND password_setup_token_hash = $3
       AND password_setup_expires_at > NOW()
     RETURNING id, first_name, last_name, badge_number, role, session_version`,
    [input.userId, input.passwordHash, input.expectedSetupTokenHash]
  );

  return rows[0] ?? null;
}

export async function findActiveWorkshopUserBySession(input: {
  userId: number;
  badgeNumber: string;
}): Promise<WorkshopSessionUser | null> {
  const { rows } = await pool.query<WorkshopSessionUser>(
    `SELECT id, first_name, last_name, badge_number, role
     FROM sentinel_users
     WHERE id = $1 AND badge_number = $2 AND is_active = TRUE AND is_deleted = FALSE`,
    [input.userId, input.badgeNumber]
  );

  return rows[0] ?? null;
}
