import { PoolClient } from 'pg';
import pool from '../../db/pool';
import { statusInSql } from '../../db/sql';
import { ACTIVE_INCIDENT_STATUSES, isWorkshopRole } from '../../domain/constants';
import { CreateAccountInput, UpdateAccountInput } from './accounts.validation';
import { AccountRow, toPublicAccount } from './accounts.mapper';

export interface ListAccountsFilters {
  role?: string;
  sort?: string;
  order?: string;
}

export interface AccountDto {
  id: number;
  first_name: string;
  last_name: string;
  badge_number: string;
  role: string;
  is_active: boolean;
  email: string | null;
  has_password: boolean;
  has_password_setup_code: boolean;
  password_setup_expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
  password_setup_code?: string;
}

export interface AccountImpactDto {
  reported_incidents: number;
  taken_incidents: number;
  active_taken_incidents: number;
}

const accountSelect = `id, first_name, last_name, badge_number, role, is_active, email,
  password_hash IS NOT NULL AS has_password,
  (
    password_hash IS NULL
    AND password_setup_token_hash IS NOT NULL
    AND password_setup_expires_at > NOW()
  ) AS has_password_setup_code,
  password_setup_expires_at,
  created_at, updated_at`;

export async function listAccountsData(filters: ListAccountsFilters): Promise<AccountDto[]> {
  const conditions: string[] = ['is_deleted = FALSE'];
  const params: unknown[] = [];

  if (filters.role && isWorkshopRole(filters.role)) {
    params.push(filters.role);
    conditions.push(`role = $${params.length}`);
  }

  const safeOrder = filters.order === 'asc' ? 'ASC' : 'DESC';
  const orderClause =
    filters.sort === 'alphabetical'
      ? `last_name ${safeOrder}, first_name ${safeOrder}`
      : `created_at ${safeOrder}`;

  const { rows } = await pool.query<AccountDto>(
    `SELECT ${accountSelect}
     FROM sentinel_users
     WHERE ${conditions.join(' AND ')}
     ORDER BY ${orderClause}`,
    params
  );

  return rows;
}

export async function accountBadgeExists(
  badgeNumber: string,
  excludeUserId?: number,
  client?: PoolClient
): Promise<boolean> {
  const db = client ?? pool;
  const params: unknown[] = [badgeNumber];
  const excludeClause = excludeUserId ? 'AND id != $2' : '';
  if (excludeUserId) params.push(excludeUserId);

  const { rows } = await db.query<{ id: number }>(
    `SELECT id FROM sentinel_users
     WHERE lower(btrim(badge_number)) = lower(btrim($1))
       AND is_deleted = FALSE ${excludeClause}`,
    params
  );

  return rows.length > 0;
}

export async function createAccountData(
  input: CreateAccountInput,
  setupCodeHash: string,
  setupExpiresAt: Date,
  client?: PoolClient
): Promise<AccountDto> {
  const db = client ?? pool;
  const { rows } = await db.query<AccountDto>(
    `INSERT INTO sentinel_users (
       first_name, last_name, badge_number, role, email,
       password_setup_token_hash, password_setup_expires_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${accountSelect}`,
    [
      input.firstName,
      input.lastName,
      input.badgeNumber,
      input.role,
      input.email ?? null,
      setupCodeHash,
      setupExpiresAt,
    ]
  );

  return rows[0];
}

export async function getAccountData(
  id: number,
  client?: PoolClient,
  forUpdate = false
): Promise<AccountDto | null> {
  const db = client ?? pool;
  const { rows } = await db.query<AccountDto>(
    `SELECT ${accountSelect}
     FROM sentinel_users
     WHERE id = $1 AND is_deleted = FALSE
     ${forUpdate ? 'FOR UPDATE' : ''}`,
    [id]
  );

  return rows[0] ?? null;
}

export async function updateAccountData(
  id: number,
  updates: UpdateAccountInput,
  client?: PoolClient
): Promise<AccountDto | null> {
  const db = client ?? pool;

  const { rows: existing } = await db.query<AccountRow>(
    'SELECT * FROM sentinel_users WHERE id = $1 AND is_deleted = FALSE',
    [id]
  );
  if (existing.length === 0) return null;

  const current = existing[0];
  const setClauses: string[] = ['updated_at = NOW()'];
  const params: unknown[] = [];

  if (updates.firstName !== undefined && updates.firstName !== current.first_name) {
    params.push(updates.firstName);
    setClauses.push(`first_name = $${params.length}`);
  }
  if (updates.lastName !== undefined && updates.lastName !== current.last_name) {
    params.push(updates.lastName);
    setClauses.push(`last_name = $${params.length}`);
  }
  if (updates.badgeNumber !== undefined && updates.badgeNumber !== current.badge_number) {
    params.push(updates.badgeNumber);
    setClauses.push(`badge_number = $${params.length}`);
  }
  if (updates.role !== undefined && updates.role !== current.role) {
    params.push(updates.role);
    setClauses.push(`role = $${params.length}`);
  }
  if (updates.email !== undefined && updates.email !== current.email) {
    params.push(updates.email ?? null);
    setClauses.push(`email = $${params.length}`);
  }

  if (params.length === 0) {
    return toPublicAccount(current);
  }

  params.push(id);
  const { rows } = await db.query<AccountDto>(
    `UPDATE sentinel_users SET ${setClauses.join(', ')}
     WHERE id = $${params.length}
     RETURNING ${accountSelect}`,
    params
  );

  return rows[0] ?? null;
}

export async function setAccountActive(
  id: number,
  isActive: boolean,
  client?: PoolClient
): Promise<AccountDto | null> {
  const db = client ?? pool;
  const { rows } = await db.query<AccountDto>(
    `UPDATE sentinel_users
     SET is_active = $2,
         session_version = session_version
           + CASE WHEN is_active IS DISTINCT FROM $2 THEN 1 ELSE 0 END,
         updated_at = NOW()
     WHERE id = $1 AND is_deleted = FALSE
     RETURNING ${accountSelect}`,
    [id, isActive]
  );

  return rows[0] ?? null;
}

// RGPD : la suppression anonymise les données personnelles (nom, prénom, badge)
// et détruit les credentials dans la même requête. L'id est conservé pour
// l'intégrité référentielle des incidents et de l'audit trail (pseudonymisation).
export async function softDeleteAccount(id: number, client?: PoolClient): Promise<boolean> {
  const db = client ?? pool;
  const { rows } = await db.query<{ id: number }>(
    `UPDATE sentinel_users
     SET is_deleted = TRUE,
         deleted_at = NOW(),
         updated_at = NOW(),
         first_name = 'Utilisateur',
         last_name = 'Supprimé',
         badge_number = 'ANON-' || id,
         email = NULL,
         password_hash = NULL,
         password_setup_token_hash = NULL,
         password_setup_expires_at = NULL
     WHERE id = $1 AND is_deleted = FALSE
     RETURNING id`,
    [id]
  );

  return rows.length > 0;
}

export async function getAccountImpactData(id: number): Promise<AccountImpactDto> {
  const { rows } = await pool.query<AccountImpactDto>(
    `SELECT
       COUNT(*) FILTER (WHERE user_id = $1)::int AS reported_incidents,
       COUNT(*) FILTER (WHERE taken_by_user_id = $1)::int AS taken_incidents,
       COUNT(*) FILTER (
         WHERE taken_by_user_id = $1 AND ${statusInSql('status', ACTIVE_INCIDENT_STATUSES)}
       )::int AS active_taken_incidents
     FROM workshop_incidents`,
    [id]
  );

  return (
    rows[0] || {
      reported_incidents: 0,
      taken_incidents: 0,
      active_taken_incidents: 0,
    }
  );
}

export async function resetAccountPasswordData(
  id: number,
  setupCodeHash: string,
  setupExpiresAt: Date,
  client?: PoolClient
): Promise<AccountDto | null> {
  const db = client ?? pool;
  const { rows } = await db.query<AccountDto>(
    `UPDATE sentinel_users
     SET password_hash = NULL,
         password_setup_token_hash = $2,
         password_setup_expires_at = $3,
         session_version = session_version + 1,
         updated_at = NOW()
     WHERE id = $1 AND is_deleted = FALSE AND is_active = TRUE
     RETURNING ${accountSelect}`,
    [id, setupCodeHash, setupExpiresAt]
  );

  return rows[0] ?? null;
}

export async function getActiveTakenIncidentCountForUser(
  userId: number,
  client?: PoolClient
): Promise<number> {
  const db = client ?? pool;
  const { rows } = await db.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
     FROM workshop_incidents
     WHERE taken_by_user_id = $1 AND ${statusInSql('status', ACTIVE_INCIDENT_STATUSES)}`,
    [userId]
  );

  return rows[0]?.count ?? 0;
}
