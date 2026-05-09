import pool from '../../db/pool';
import { CreateAccountInput, UpdateAccountInput } from './accounts.validation';

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
  has_password: boolean;
  created_at: Date;
  updated_at: Date;
}

interface AccountRow extends AccountDto {
  password_hash?: string | null;
}

export interface AccountImpactDto {
  reported_incidents: number;
  taken_incidents: number;
  active_taken_incidents: number;
}

export interface AccountUpdateResult {
  account: AccountDto;
  changes: Record<string, { old: unknown; new: unknown }>;
}

const accountSelect = `id, first_name, last_name, badge_number, role, is_active,
  password_hash IS NOT NULL AS has_password, created_at, updated_at`;

function toPublicAccount(row: AccountRow): AccountDto {
  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    badge_number: row.badge_number,
    role: row.role,
    is_active: row.is_active,
    has_password: row.password_hash !== null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function listAccountsData(filters: ListAccountsFilters): Promise<AccountDto[]> {
  const conditions: string[] = ['is_deleted = FALSE'];
  const params: unknown[] = [];

  if (filters.role && ['OPERATOR', 'MAINTENANCE', 'RESPONSABLE'].includes(filters.role)) {
    params.push(filters.role);
    conditions.push(`role = $${params.length}`);
  }

  const safeOrder = filters.order === 'asc' ? 'ASC' : 'DESC';
  const orderClause = filters.sort === 'alphabetical'
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

export async function accountBadgeExists(badgeNumber: string, excludeUserId?: number): Promise<boolean> {
  const params: unknown[] = [badgeNumber];
  const excludeClause = excludeUserId ? 'AND id != $2' : '';
  if (excludeUserId) params.push(excludeUserId);

  const { rows } = await pool.query<{ id: number }>(
    `SELECT id FROM sentinel_users
     WHERE badge_number = $1 AND is_deleted = FALSE ${excludeClause}`,
    params
  );

  return rows.length > 0;
}

export async function createAccountData(input: CreateAccountInput): Promise<AccountDto> {
  const { rows } = await pool.query<AccountDto>(
    `INSERT INTO sentinel_users (first_name, last_name, badge_number, role)
     VALUES ($1, $2, $3, $4)
     RETURNING ${accountSelect}`,
    [input.firstName, input.lastName, input.badgeNumber, input.role]
  );

  return rows[0];
}

export async function getAccountData(id: number): Promise<AccountDto | null> {
  const { rows } = await pool.query<AccountDto>(
    `SELECT ${accountSelect}
     FROM sentinel_users
     WHERE id = $1 AND is_deleted = FALSE`,
    [id]
  );

  return rows[0] ?? null;
}

export async function updateAccountData(id: number, updates: UpdateAccountInput): Promise<AccountUpdateResult | null> {
  const { rows: existing } = await pool.query<AccountRow>(
    'SELECT * FROM sentinel_users WHERE id = $1 AND is_deleted = FALSE',
    [id]
  );
  if (existing.length === 0) return null;

  const current = existing[0];
  const setClauses: string[] = ['updated_at = NOW()'];
  const params: unknown[] = [];
  const changes: Record<string, { old: unknown; new: unknown }> = {};

  if (updates.firstName !== undefined && updates.firstName !== current.first_name) {
    params.push(updates.firstName);
    setClauses.push(`first_name = $${params.length}`);
    changes.firstName = { old: current.first_name, new: updates.firstName };
  }
  if (updates.lastName !== undefined && updates.lastName !== current.last_name) {
    params.push(updates.lastName);
    setClauses.push(`last_name = $${params.length}`);
    changes.lastName = { old: current.last_name, new: updates.lastName };
  }
  if (updates.badgeNumber !== undefined && updates.badgeNumber !== current.badge_number) {
    params.push(updates.badgeNumber);
    setClauses.push(`badge_number = $${params.length}`);
    changes.badgeNumber = { old: current.badge_number, new: updates.badgeNumber };
  }
  if (updates.role !== undefined && updates.role !== current.role) {
    params.push(updates.role);
    setClauses.push(`role = $${params.length}`);
    changes.role = { old: current.role, new: updates.role };
  }

  if (Object.keys(changes).length === 0) {
    return { account: toPublicAccount(current), changes };
  }

  params.push(id);
  const { rows } = await pool.query<AccountDto>(
    `UPDATE sentinel_users SET ${setClauses.join(', ')}
     WHERE id = $${params.length}
     RETURNING ${accountSelect}`,
    params
  );

  return { account: rows[0], changes };
}

export async function setAccountActive(id: number, isActive: boolean): Promise<AccountDto | null> {
  const { rows } = await pool.query<AccountDto>(
    `UPDATE sentinel_users SET is_active = $2, updated_at = NOW()
     WHERE id = $1 AND is_deleted = FALSE
     RETURNING ${accountSelect}`,
    [id, isActive]
  );

  return rows[0] ?? null;
}

export async function softDeleteAccount(id: number): Promise<boolean> {
  const { rows } = await pool.query<{ id: number }>(
    `UPDATE sentinel_users
     SET is_deleted = TRUE, deleted_at = NOW(), updated_at = NOW()
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
         WHERE taken_by_user_id = $1 AND status IN ('OPEN', 'PENDING')
       )::int AS active_taken_incidents
     FROM workshop_incidents`,
    [id]
  );

  return rows[0] || {
    reported_incidents: 0,
    taken_incidents: 0,
    active_taken_incidents: 0,
  };
}

export async function resetAccountPasswordData(id: number): Promise<AccountDto | null> {
  const { rows } = await pool.query<AccountDto>(
    `UPDATE sentinel_users
     SET password_hash = NULL, updated_at = NOW()
     WHERE id = $1 AND is_deleted = FALSE
     RETURNING ${accountSelect}`,
    [id]
  );

  return rows[0] ?? null;
}

export async function getActiveTakenIncidentCountForUser(userId: number): Promise<number> {
  const { rows } = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
     FROM workshop_incidents
     WHERE taken_by_user_id = $1 AND status IN ('OPEN', 'PENDING')`,
    [userId]
  );

  return rows[0]?.count ?? 0;
}
