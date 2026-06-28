import pool from '../../db/pool';

type AuditOrder = 'ASC' | 'DESC';

interface UserStatsDto {
  users_total: number;
  users_active: number;
  users_inactive: number;
  users_without_password: number;
}

interface LineStatsDto {
  lines_total: number;
  lines_active: number;
  lines_inactive: number;
  machines_total: number;
  active_lines_without_machines: number;
}

export interface ReferenceAuditEventDto {
  id: number;
  scope: 'account' | 'line';
  event_type: string;
  changes: Record<string, unknown> | null;
  created_at: Date;
  first_name: string | null;
  last_name: string | null;
  badge_number: string | null;
  line_number: string | null;
}

export interface ReferenceDashboardDto extends UserStatsDto, LineStatsDto {
  recent_events: ReferenceAuditEventDto[];
}

interface ReferenceUserDto {
  id: number;
  first_name: string;
  last_name: string;
  badge_number: string;
  role: string;
}

interface ReferenceInactiveLineDto {
  id: number;
  line_number: string;
  machine_count: number;
}

interface ReferenceQualityLineDto {
  id: number;
  line_number: string;
  machines: Array<{ machineId?: string; brand?: string }>;
  is_active: boolean;
}

interface MalformedMachineDto {
  line_id: number;
  line_number: string;
  machine_id: string;
  issue: string;
}

interface DuplicateMachineDto {
  machine_id: string;
  line_numbers: string[];
}

export interface ReferenceQualityDto {
  users_without_password: ReferenceUserDto[];
  inactive_users: ReferenceUserDto[];
  inactive_lines: ReferenceInactiveLineDto[];
  malformed_machines: MalformedMachineDto[];
  duplicate_machines: DuplicateMachineDto[];
}

export interface ListReferenceAuditFilters {
  scope: string;
  taskGroup: string;
  q: string;
  start: string;
  end: string;
  order: AuditOrder;
  limit: number;
}

const taskGroups: Record<string, string[]> = {
  creation: ['USER_CREATED', 'LINE_CREATED'],
  modification: ['USER_UPDATED', 'LINE_UPDATED', 'LINE_SUMMARY_UPDATED', 'LINE_MACHINE_UPDATED', 'LINE_PLAN_UPDATED'],
  status: ['USER_ACTIVATED', 'USER_DEACTIVATED'],
  deletion: ['USER_SOFT_DELETED', 'LINE_SOFT_DELETED'],
  access: ['USER_PASSWORD_RESET'],
};

// On affiche l'identité FIGÉE dans l'event (target_*) : un journal d'audit
// montre qui était la cible au moment de l'action, pas son état actuel (qui
// peut être anonymisé après suppression). La jointure live ne sert que de repli
// pour d'éventuels anciens events sans snapshot.
const accountAuditSql = `
  SELECT ae.id, 'account' AS scope, ae.event_type, ae.changes, ae.created_at,
         COALESCE(ae.target_first_name, su.first_name) AS first_name,
         COALESCE(ae.target_last_name, su.last_name) AS last_name,
         COALESCE(ae.target_badge_number, su.badge_number) AS badge_number,
         NULL::varchar AS line_number
  FROM account_audit_events ae
  LEFT JOIN sentinel_users su ON su.id = ae.target_user_id`;

const lineAuditSql = `
  SELECT le.id, 'line' AS scope, le.event_type, le.changes, le.created_at,
         NULL::varchar AS first_name, NULL::varchar AS last_name, NULL::varchar AS badge_number,
         pl.line_number
  FROM line_audit_events le
  LEFT JOIN production_lines pl ON pl.id = le.target_line_id`;

export async function getReferenceDashboardData(): Promise<ReferenceDashboardDto> {
  const [userStats, lineStats, recentAccountEvents, recentLineEvents] = await Promise.all([
    pool.query<UserStatsDto>(
      `SELECT
         COUNT(*) FILTER (WHERE is_deleted = FALSE)::int AS users_total,
         COUNT(*) FILTER (WHERE is_deleted = FALSE AND is_active = TRUE)::int AS users_active,
         COUNT(*) FILTER (WHERE is_deleted = FALSE AND is_active = FALSE)::int AS users_inactive,
         COUNT(*) FILTER (WHERE is_deleted = FALSE AND is_active = TRUE AND password_hash IS NULL)::int AS users_without_password
       FROM sentinel_users`
    ),
    pool.query<LineStatsDto>(
      `SELECT
         COUNT(*) FILTER (WHERE is_deleted = FALSE)::int AS lines_total,
         COUNT(*) FILTER (WHERE is_deleted = FALSE AND is_active = TRUE)::int AS lines_active,
         COUNT(*) FILTER (WHERE is_deleted = FALSE AND is_active = FALSE)::int AS lines_inactive,
         COALESCE(SUM(jsonb_array_length(machine_sequence)) FILTER (WHERE is_deleted = FALSE), 0)::int AS machines_total,
         COUNT(*) FILTER (WHERE is_deleted = FALSE AND is_active = TRUE AND jsonb_array_length(machine_sequence) = 0)::int AS active_lines_without_machines
       FROM production_lines`
    ),
    pool.query<ReferenceAuditEventDto>(`${accountAuditSql} ORDER BY ae.created_at DESC LIMIT 5`),
    pool.query<ReferenceAuditEventDto>(`${lineAuditSql} ORDER BY le.created_at DESC LIMIT 5`),
  ]);

  const recentEvents = [...recentAccountEvents.rows, ...recentLineEvents.rows]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 8);

  return {
    ...userStats.rows[0],
    ...lineStats.rows[0],
    recent_events: recentEvents,
  };
}

export interface ReferenceQualityRawDto {
  users_without_password: ReferenceUserDto[];
  inactive_users: ReferenceUserDto[];
  inactive_lines: ReferenceInactiveLineDto[];
  all_lines: ReferenceQualityLineDto[];
}

export async function getReferenceQualityRawData(): Promise<ReferenceQualityRawDto> {
  const [usersWithoutPassword, inactiveUsers, inactiveLines, lineIssues] = await Promise.all([
    pool.query<ReferenceUserDto>(
      `SELECT id, first_name, last_name, badge_number, role
       FROM sentinel_users
       WHERE is_deleted = FALSE AND is_active = TRUE AND password_hash IS NULL
       ORDER BY last_name ASC, first_name ASC`
    ),
    pool.query<ReferenceUserDto>(
      `SELECT id, first_name, last_name, badge_number, role
       FROM sentinel_users
       WHERE is_deleted = FALSE AND is_active = FALSE
       ORDER BY updated_at DESC`
    ),
    pool.query<ReferenceInactiveLineDto>(
      `SELECT id, line_number, jsonb_array_length(machine_sequence)::int AS machine_count
       FROM production_lines
       WHERE is_deleted = FALSE AND is_active = FALSE
       ORDER BY updated_at DESC`
    ),
    pool.query<ReferenceQualityLineDto>(
      `SELECT id, line_number, machine_sequence AS machines, is_active
       FROM production_lines
       WHERE is_deleted = FALSE
       ORDER BY line_number ASC`
    ),
  ]);

  return {
    users_without_password: usersWithoutPassword.rows,
    inactive_users: inactiveUsers.rows,
    inactive_lines: inactiveLines.rows,
    all_lines: lineIssues.rows,
  };
}

export interface PasswordResetRequestDto {
  id: number;
  user_id: number;
  first_name: string;
  last_name: string;
  badge_number: string;
  requested_at: Date;
}

export async function listPendingPasswordResetRequestsData(): Promise<PasswordResetRequestDto[]> {
  const { rows } = await pool.query<PasswordResetRequestDto>(
    `SELECT prr.id, prr.user_id, su.first_name, su.last_name, prr.badge_number, prr.requested_at
     FROM password_reset_requests prr
     JOIN sentinel_users su ON su.id = prr.user_id
     WHERE prr.handled_at IS NULL
     ORDER BY prr.requested_at ASC`
  );
  return rows;
}

export async function markPasswordResetRequestHandledData(id: number): Promise<boolean> {
  const { rows } = await pool.query<{ id: number }>(
    `UPDATE password_reset_requests SET handled_at = NOW()
     WHERE id = $1 AND handled_at IS NULL
     RETURNING id`,
    [id]
  );
  return rows.length > 0;
}

export async function listReferenceAuditData(filters: ListReferenceAuditFilters): Promise<ReferenceAuditEventDto[]> {
  const params: unknown[] = [];
  const conditions: string[] = [];

  const events = taskGroups[filters.taskGroup];
  if (events?.length) {
    params.push(events);
    conditions.push(`event_type = ANY($${params.length})`);
  }
  if (filters.start) {
    params.push(filters.start);
    conditions.push(`created_at >= $${params.length}`);
  }
  if (filters.end) {
    params.push(filters.end);
    conditions.push(`created_at <= $${params.length}`);
  }
  if (filters.q) {
    params.push(`%${filters.q}%`);
    conditions.push(`(
      event_type ILIKE $${params.length}
      OR COALESCE(first_name, '') ILIKE $${params.length}
      OR COALESCE(last_name, '') ILIKE $${params.length}
      OR COALESCE(badge_number, '') ILIKE $${params.length}
      OR COALESCE(line_number, '') ILIKE $${params.length}
      OR COALESCE(changes::text, '') ILIKE $${params.length}
    )`);
  }

  const scopedSql = filters.scope === 'account'
    ? accountAuditSql
    : filters.scope === 'line'
      ? lineAuditSql
      : `${accountAuditSql} UNION ALL ${lineAuditSql}`;
  const baseSql = `SELECT * FROM (${scopedSql}) events`;

  params.push(filters.limit);
  const whereClause = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
  const sql = `${baseSql}${whereClause} ORDER BY created_at ${filters.order} LIMIT $${params.length}`;

  const { rows } = await pool.query<ReferenceAuditEventDto>(sql, params);
  return rows;
}
