import { PoolClient } from 'pg';
import pool from '../../db/pool';
import { boundedInt, parseOptionalInt, statusEqualsSql, statusInSql } from '../../db/sql';
import {
  ACTIVE_INCIDENT_STATUSES,
  INCIDENT_STATUSES,
  isIncidentState,
  isIncidentStatus,
  IncidentStatus,
} from '../../domain/constants';
import { CurrentIncident } from './workshop.policy';
import { CreateIncidentInput, UpdateIncidentInput } from './workshop.validation';

export type IncidentListMode = 'history' | 'knowledge';
type QueryParams = Record<string, unknown>;

const activeIncidentStatusSql = statusInSql('status', ACTIVE_INCIDENT_STATUSES);
const openStatusSql = statusEqualsSql('status', 'OPEN');
const pendingStatusSql = statusEqualsSql('status', 'PENDING');
const closedStatusSql = statusEqualsSql('status', 'CLOSED');
const nonTerminalRejectedWorkshopIncidentStatusSql = statusInSql('wi.status', INCIDENT_STATUSES.filter(
  (status) => status !== 'CANCELED' && status !== 'INVALIDATED'
));

export type StoredMachine =
  | {
      machineId: string;
      brand: string;
      hasDoubleRobot: false;
      robotNumber: string;
      robotHeads: number;
    }
  | {
      machineId: string;
      brand: string;
      hasDoubleRobot: true;
      leftRobotNumber: string;
      leftRobotHeads: number;
      rightRobotNumber: string;
      rightRobotHeads: number;
    };

export interface ActiveWorkshopLine {
  id: number;
  line_number: string;
  machines: StoredMachine[];
}

export interface IncidentCancelSnapshot {
  status: IncidentStatus;
  is_taken: boolean;
  taken_by_user_id: number | null;
  cancel_request?: boolean;
  cancel_request_reason?: string | null;
  delete_request?: boolean;
  delete_request_reason?: string | null;
  edit_request?: unknown | null;
}

export interface WorkshopIncidentRow extends CurrentIncident {
  id: number;
  shift: string;
  line_id: number;
  line_number: string;
  machine_id: string;
  machine_brand: string;
  robot_label: string;
  head_number: number;
  state: string;
  comment: string | null;
  current_product: string | null;
  is_priority: boolean;
  diagnostic: string | null;
  intervention_note: string | null;
  responsible_comment: string | null;
  edit_request: unknown | null;
  cancel_request?: boolean;
  cancel_request_reason?: string | null;
  taken_at: Date | null;
  display_order: number;
  created_at: Date;
  updated_at: Date;
  is_followed?: boolean;
  followed_at?: Date | null;
  [key: string]: unknown;
}

export interface IncidentSelection {
  lineNumber: string;
  machineBrand: string;
}

export interface WorkshopIncidentMetricsResult {
  global?: {
    total: number;
    open: number;
    pending: number;
    priority: number;
    taken: number;
    not_taken: number;
    open_over_7d: number;
  };
  personal?: {
    assigned_to_me: number;
    followed: number;
    followed_resolved: number;
  };
  total: number;
  open: number;
  pending: number;
  priority: number;
  taken: number;
  not_taken: number;
  assigned_to_me: number;
  followed: number;
  followed_resolved: number;
  open_over_7d: number;
}

function buildIncidentWorkspaceFilters(
  query: QueryParams,
  mode: IncidentListMode
): { whereClause: string; params: Array<string | number>; limit: number } {
  const { q, status, state, lineId, machineId, limit } = query;
  const filters: string[] = [];
  const params: Array<string | number> = [];
  const safeLimit = boundedInt(limit, 200, 1, 500);

  if (mode === 'knowledge') {
    filters.push(statusEqualsSql('wi.status', 'CLOSED'));
    filters.push(`wi.intervention_note IS NOT NULL`);
    filters.push(`btrim(wi.intervention_note) != ''`);
  } else if (status && isIncidentStatus(String(status))) {
    params.push(String(status));
    filters.push(`wi.status = $${params.length}`);
  }

  if (state && isIncidentState(String(state))) {
    params.push(String(state));
    filters.push(`wi.state = $${params.length}`);
  }

  if (lineId) {
    const parsedLine = parseOptionalInt(lineId);
    if (parsedLine !== null) {
      params.push(parsedLine);
      filters.push(`wi.line_id = $${params.length}`);
    }
  }

  if (machineId) {
    params.push(String(machineId));
    filters.push(`wi.machine_id = $${params.length}`);
  }

  if (q && String(q).trim()) {
    params.push(`%${String(q).trim()}%`);
    filters.push(`(
      wi.comment ILIKE $${params.length}
      OR wi.diagnostic ILIKE $${params.length}
      OR wi.intervention_note ILIKE $${params.length}
      OR wi.responsible_comment ILIKE $${params.length}
      OR wi.machine_id ILIKE $${params.length}
      OR wi.machine_brand ILIKE $${params.length}
      OR wi.line_number ILIKE $${params.length}
      OR wi.robot_label ILIKE $${params.length}
      OR wi.current_product ILIKE $${params.length}
      OR su.first_name ILIKE $${params.length}
      OR su.last_name ILIKE $${params.length}
      OR tu.first_name ILIKE $${params.length}
      OR tu.last_name ILIKE $${params.length}
    )`);
  }

  return {
    whereClause: filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '',
    params,
    limit: safeLimit,
  };
}

function buildHistoryEventFilters(query: QueryParams): { whereClause: string; params: Array<string | number>; limit: number } {
  const { q, status, state, lineId, machineId, eventType, limit } = query;
  const filters: string[] = [];
  const params: Array<string | number> = [];
  const safeLimit = boundedInt(limit, 200, 1, 500);

  if (status && isIncidentStatus(String(status))) {
    params.push(String(status));
    filters.push(`wi.status = $${params.length}`);
  }
  if (state && isIncidentState(String(state))) {
    params.push(String(state));
    filters.push(`wi.state = $${params.length}`);
  }
  if (lineId) {
    const parsedLine = parseOptionalInt(lineId);
    if (parsedLine !== null) {
      params.push(parsedLine);
      filters.push(`wi.line_id = $${params.length}`);
    }
  }
  if (machineId) {
    params.push(String(machineId));
    filters.push(`wi.machine_id = $${params.length}`);
  }
  if (eventType && String(eventType) !== 'all') {
    params.push(String(eventType));
    filters.push(`we.event_type = $${params.length}`);
  }
  if (q && String(q).trim()) {
    params.push(`%${String(q).trim()}%`);
    filters.push(`(
      wi.comment ILIKE $${params.length}
      OR wi.diagnostic ILIKE $${params.length}
      OR wi.intervention_note ILIKE $${params.length}
      OR wi.responsible_comment ILIKE $${params.length}
      OR wi.machine_id ILIKE $${params.length}
      OR wi.machine_brand ILIKE $${params.length}
      OR wi.line_number ILIKE $${params.length}
      OR wi.robot_label ILIKE $${params.length}
      OR wi.current_product ILIKE $${params.length}
      OR we.event_type ILIKE $${params.length}
      OR su.first_name ILIKE $${params.length}
      OR su.last_name ILIKE $${params.length}
    )`);
  }

  return {
    whereClause: filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '',
    params,
    limit: safeLimit,
  };
}

export async function getBoardData() {
  const [lineResult, incidentResult, metricResult] = await Promise.all([
    pool.query(
      `SELECT id, line_number
       FROM production_lines
       WHERE is_deleted = FALSE AND is_active = TRUE
       ORDER BY line_number ASC`
    ),
    pool.query(
      `SELECT id, shift, line_id, line_number, machine_id, robot_label,
              head_number, state, current_product, is_taken, is_priority,
              status, display_order, created_at, updated_at
       FROM workshop_incidents
       WHERE ${activeIncidentStatusSql}
       ORDER BY is_priority DESC, display_order DESC, is_taken ASC, created_at DESC`
    ),
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE ${activeIncidentStatusSql})::int AS total,
         COUNT(*) FILTER (WHERE ${openStatusSql})::int AS open_count,
         COUNT(*) FILTER (WHERE ${pendingStatusSql})::int AS pending_count,
         COUNT(*) FILTER (
           WHERE ${openStatusSql} AND NOW() - created_at > INTERVAL '7 days'
         )::int AS open_over_7d
       FROM workshop_incidents`
    ),
  ]);

  const metrics = metricResult.rows[0];
  return {
    lines: lineResult.rows,
    incidents: incidentResult.rows,
    metrics: {
      total: metrics.total,
      open: metrics.open_count,
      pending: metrics.pending_count,
      open_over_7d: metrics.open_over_7d,
    },
  };
}

export async function listActiveWorkshopLines() {
  const { rows } = await pool.query(
    `SELECT id, line_number, machine_sequence AS machines, is_active, created_at, updated_at
     FROM production_lines
     WHERE is_deleted = FALSE AND is_active = TRUE
     ORDER BY line_number ASC`
  );

  return rows;
}

export async function listIncidents(userId: number, role: string) {
  const includeFollowedResolved = role === 'RESPONSABLE';
  const { rows } = await pool.query(
    `SELECT wi.id, wi.shift, wi.line_id, wi.line_number, wi.machine_id, wi.machine_brand,
            wi.robot_label, wi.head_number, wi.state, wi.comment, wi.current_product,
            wi.is_taken, wi.is_priority, wi.status, wi.diagnostic, wi.intervention_note,
          wi.responsible_comment, wi.edit_request, wi.cancel_request, wi.cancel_request_reason,
          wi.taken_by_user_id, wi.taken_at, wi.display_order, wi.created_at, wi.updated_at,
          su.first_name, su.last_name, su.role,
          tu.first_name AS taken_by_first_name,
          tu.last_name AS taken_by_last_name,
          tu.role AS taken_by_role,
          (wif.id IS NOT NULL) AS is_followed,
          wif.created_at AS followed_at
     FROM workshop_incidents wi
     JOIN sentinel_users su ON su.id = wi.user_id
     LEFT JOIN sentinel_users tu ON tu.id = wi.taken_by_user_id
     LEFT JOIN workshop_incident_followers wif
       ON wif.incident_id = wi.id
      AND wif.user_id = $1
      AND wif.deleted_at IS NULL
     WHERE wi.status IN ('OPEN', 'PENDING')
        OR ($2 = TRUE AND wif.id IS NOT NULL)
     ORDER BY
       CASE WHEN wi.status IN ('OPEN', 'PENDING') THEN 0 ELSE 1 END ASC,
       wi.is_priority DESC,
       wi.display_order DESC,
       wi.is_taken ASC,
       wi.created_at DESC`,
    [userId, includeFollowedResolved]
  );

  return rows;
}

export async function listIncidentWorkspaceRows(query: QueryParams, mode: IncidentListMode) {
  const { whereClause, params, limit } = buildIncidentWorkspaceFilters(query, mode);
  const orderBy = mode === 'knowledge'
    ? 'wi.updated_at DESC, wi.created_at DESC'
    : 'wi.created_at DESC, wi.updated_at DESC';

  const { rows } = await pool.query(
    `SELECT wi.id, wi.shift, wi.line_id, wi.line_number, wi.machine_id, wi.machine_brand,
            wi.robot_label, wi.head_number, wi.state, wi.comment, wi.current_product,
            wi.is_taken, wi.is_priority, wi.status, wi.diagnostic, wi.intervention_note,
            wi.responsible_comment, wi.edit_request, wi.cancel_request, wi.cancel_request_reason,
            wi.taken_by_user_id, wi.taken_at, wi.display_order, wi.created_at, wi.updated_at,
            su.first_name, su.last_name, su.role,
            tu.first_name AS taken_by_first_name,
            tu.last_name AS taken_by_last_name,
            tu.role AS taken_by_role
     FROM workshop_incidents wi
     JOIN sentinel_users su ON su.id = wi.user_id
     LEFT JOIN sentinel_users tu ON tu.id = wi.taken_by_user_id
     ${whereClause}
     ORDER BY ${orderBy}
     LIMIT $${params.length + 1}`,
    [...params, limit]
  );

  return rows;
}

export async function fetchIncidentWithUsers(incidentId: number) {
  const { rows } = await pool.query(
    `SELECT wi.id, wi.shift, wi.line_id, wi.line_number, wi.machine_id, wi.machine_brand,
            wi.robot_label, wi.head_number, wi.state, wi.comment, wi.current_product,
            wi.is_taken, wi.is_priority, wi.status, wi.diagnostic, wi.intervention_note,
            wi.responsible_comment, wi.edit_request, wi.cancel_request, wi.cancel_request_reason,
            wi.taken_by_user_id, wi.taken_at, wi.display_order, wi.created_at, wi.updated_at,
            su.first_name, su.last_name, su.role,
            tu.first_name AS taken_by_first_name,
            tu.last_name AS taken_by_last_name,
            tu.role AS taken_by_role
     FROM workshop_incidents wi
     JOIN sentinel_users su ON su.id = wi.user_id
     LEFT JOIN sentinel_users tu ON tu.id = wi.taken_by_user_id
     WHERE wi.id = $1`,
    [incidentId]
  );

  return rows[0];
}

export async function fetchIncidentWithUsersForActor(incidentId: number, actorUserId: number) {
  const { rows } = await pool.query(
    `SELECT wi.id, wi.shift, wi.line_id, wi.line_number, wi.machine_id, wi.machine_brand,
            wi.robot_label, wi.head_number, wi.state, wi.comment, wi.current_product,
            wi.is_taken, wi.is_priority, wi.status, wi.diagnostic, wi.intervention_note,
            wi.responsible_comment, wi.edit_request, wi.cancel_request, wi.cancel_request_reason,
            wi.taken_by_user_id, wi.taken_at, wi.display_order, wi.created_at, wi.updated_at,
            su.first_name, su.last_name, su.role,
            tu.first_name AS taken_by_first_name,
            tu.last_name AS taken_by_last_name,
            tu.role AS taken_by_role,
            (wif.id IS NOT NULL) AS is_followed,
            wif.created_at AS followed_at
     FROM workshop_incidents wi
     JOIN sentinel_users su ON su.id = wi.user_id
     LEFT JOIN sentinel_users tu ON tu.id = wi.taken_by_user_id
     LEFT JOIN workshop_incident_followers wif
       ON wif.incident_id = wi.id
      AND wif.user_id = $2
      AND wif.deleted_at IS NULL
     WHERE wi.id = $1`,
    [incidentId, actorUserId]
  );

  return rows[0];
}

export async function getActiveWorkshopLine(lineId: number): Promise<ActiveWorkshopLine | null> {
  const { rows } = await pool.query<ActiveWorkshopLine>(
    `SELECT id, line_number, machine_sequence AS machines
     FROM production_lines
     WHERE id = $1 AND is_deleted = FALSE AND is_active = TRUE`,
    [lineId]
  );

  return rows[0] ?? null;
}

export async function createIncidentData(input: {
  actorUserId: number;
  data: CreateIncidentInput;
  line: ActiveWorkshopLine;
  machine: StoredMachine;
  robotLabel: string;
}, client?: PoolClient): Promise<number> {
  const db = client ?? pool;
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO workshop_incidents (
      user_id, shift, line_id, line_number, machine_id, machine_brand,
      robot_label, head_number, state, comment, current_product, display_order
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [
      input.actorUserId,
      input.data.shift,
      input.line.id,
      input.line.line_number,
      input.machine.machineId,
      input.machine.brand,
      input.robotLabel,
      input.data.headNumber,
      input.data.state,
      input.data.comment || null,
      input.data.currentProduct || null,
      Date.now(),
    ]
  );

  return rows[0].id;
}

export async function getIncidentCancelSnapshot(
  incidentId: number,
  client?: PoolClient
): Promise<IncidentCancelSnapshot | null> {
  const db = client ?? pool;
  const { rows } = await db.query<IncidentCancelSnapshot>(
    `SELECT status, is_taken, taken_by_user_id, cancel_request, cancel_request_reason,
            delete_request, delete_request_reason, edit_request
     FROM workshop_incidents
     WHERE id = $1
     FOR UPDATE`,
    [incidentId]
  );

  return rows[0] ?? null;
}

export async function cancelIncidentData(incidentId: number, client?: PoolClient): Promise<boolean> {
  const db = client ?? pool;
  const result = await db.query(
    `UPDATE workshop_incidents
     SET status = 'CANCELED',
         cancel_request = FALSE,
         cancel_request_reason = NULL,
         delete_request = FALSE,
         delete_request_reason = NULL,
         updated_at = NOW()
     WHERE id = $1`,
    [incidentId]
  );

  return (result.rowCount ?? 0) > 0;
}

export async function getIncidentById(incidentId: number, client?: PoolClient): Promise<WorkshopIncidentRow | null> {
  const db = client ?? pool;
  const { rows } = await db.query('SELECT * FROM workshop_incidents WHERE id = $1 FOR UPDATE', [incidentId]);
  return rows[0] ?? null;
}

export async function requestCancelIncident(incidentId: number, reason: string, client?: PoolClient): Promise<number | null> {
  const db = client ?? pool;
  const { rows } = await db.query<{ id: number }>(
    `UPDATE workshop_incidents
     SET cancel_request = TRUE,
         cancel_request_reason = $1,
         delete_request = TRUE,
         delete_request_reason = $1,
         updated_at = NOW()
     WHERE id = $2
     RETURNING id`,
    [reason, incidentId]
  );

  return rows[0]?.id ?? null;
}

export async function requestEditIncident(incidentId: number, editPayload: Record<string, unknown>, client?: PoolClient): Promise<number | null> {
  const db = client ?? pool;
  const { rows } = await db.query<{ id: number }>(
    `UPDATE workshop_incidents
     SET edit_request = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id`,
    [JSON.stringify(editPayload), incidentId]
  );

  return rows[0]?.id ?? null;
}

export async function rejectEditIncident(incidentId: number, client?: PoolClient): Promise<number | null> {
  const db = client ?? pool;
  const { rows } = await db.query<{ id: number }>(
    `UPDATE workshop_incidents
     SET edit_request = NULL, updated_at = NOW()
     WHERE id = $1
     RETURNING id`,
    [incidentId]
  );

  return rows[0]?.id ?? null;
}

export async function rejectCancelIncident(incidentId: number, client?: PoolClient): Promise<number | null> {
  const db = client ?? pool;
  const { rows } = await db.query<{ id: number }>(
    `UPDATE workshop_incidents
     SET cancel_request = FALSE,
         cancel_request_reason = NULL,
         delete_request = FALSE,
         delete_request_reason = NULL,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id`,
    [incidentId]
  );

  return rows[0]?.id ?? null;
}

export async function applyEditRequestIncident(input: {
  incidentId: number;
  current: WorkshopIncidentRow;
  requested: Record<string, unknown>;
  selection: IncidentSelection;
}, client?: PoolClient): Promise<number> {
  const db = client ?? pool;
  const requested = input.requested;
  const { rows } = await db.query<{ id: number }>(
    `UPDATE workshop_incidents
     SET shift = $1, line_id = $2, line_number = $3, machine_id = $4, machine_brand = $5,
         robot_label = $6, head_number = $7, state = $8, comment = $9, current_product = $10,
         edit_request = NULL, updated_at = NOW()
     WHERE id = $11
     RETURNING id`,
    [
      (requested.shift as string | undefined) ?? input.current.shift,
      (requested.lineId as number | undefined) ?? input.current.line_id,
      input.selection.lineNumber,
      (requested.machineId as string | undefined) ?? input.current.machine_id,
      input.selection.machineBrand,
      (requested.robotLabel as string | undefined) ?? input.current.robot_label,
      (requested.headNumber as number | undefined) ?? input.current.head_number,
      (requested.state as string | undefined) ?? input.current.state,
      (requested.comment as string | null | undefined) ?? input.current.comment,
      (requested.currentProduct as string | null | undefined) ?? input.current.current_product,
      input.incidentId,
    ]
  );

  return rows[0]?.id ?? null;
}

export async function invalidateIncident(incidentId: number, client?: PoolClient): Promise<number | null> {
  const db = client ?? pool;
  const { rows } = await db.query<{ id: number }>(
    `UPDATE workshop_incidents
     SET status = 'INVALIDATED',
         cancel_request = FALSE,
         cancel_request_reason = NULL,
         delete_request = FALSE,
         delete_request_reason = NULL,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id`,
    [incidentId]
  );

  return rows[0]?.id ?? null;
}

export async function updateIncidentData(input: {
  incidentId: number;
  current: WorkshopIncidentRow;
  updates: UpdateIncidentInput;
  role: string;
  actorUserId: number;
  selection: IncidentSelection;
  lineId: number;
  machineId: string;
  robotLabel: string;
  headNumber: number;
}, client?: PoolClient): Promise<number | null> {
  const db = client ?? pool;
  const { current, updates } = input;
  const tookOwnership = updates.isTaken === true && !current.is_taken;
  const nextTakenByUserId = tookOwnership ? input.actorUserId : current.taken_by_user_id;
  const nextTakenAt = tookOwnership ? new Date() : current.taken_at;

  const { rows } = await db.query<{ id: number }>(
    `UPDATE workshop_incidents
     SET shift = $1, line_id = $2, line_number = $3, machine_id = $4, machine_brand = $5,
         robot_label = $6, head_number = $7, state = $8, comment = $9, current_product = $10,
         is_taken = $11, is_priority = $12, status = $13, diagnostic = $14,
         intervention_note = $15, responsible_comment = $16,
         taken_by_user_id = $17, taken_at = $18, display_order = $19, updated_at = NOW()
     WHERE id = $20
     RETURNING id`,
    [
      updates.shift ?? current.shift,
      input.lineId,
      input.selection.lineNumber,
      input.machineId,
      input.selection.machineBrand,
      input.robotLabel,
      input.headNumber,
      updates.state ?? current.state,
      updates.comment ?? current.comment,
      updates.currentProduct ?? current.current_product,
      updates.isTaken ?? current.is_taken,
      updates.isPriority ?? current.is_priority,
      updates.status ?? current.status,
      updates.diagnostic ?? current.diagnostic,
      updates.interventionNote ?? current.intervention_note,
      input.role === 'RESPONSABLE' ? (updates.responsibleComment ?? current.responsible_comment) : current.responsible_comment,
      nextTakenByUserId,
      nextTakenAt,
      updates.displayOrder ?? current.display_order,
      input.incidentId,
    ]
  );

  return rows[0]?.id ?? null;
}

export async function reorderIncidentsData(
  orderedIncidentIds: number[],
  client?: PoolClient
): Promise<number> {
  const db = client ?? pool;
  if (orderedIncidentIds.length === 0) return 0;
  const baseOrder = orderedIncidentIds.length;
  const { rowCount } = await db.query(
    `WITH next_order AS (
       SELECT incident_id, ($1::int - ordinal)::int AS display_order
       FROM unnest($2::int[]) WITH ORDINALITY AS ordered(incident_id, ordinal)
     )
     UPDATE workshop_incidents wi
     SET display_order = next_order.display_order, updated_at = NOW()
     FROM next_order
     WHERE wi.id = next_order.incident_id
       AND wi.status IN ('OPEN', 'PENDING')`,
    [baseOrder + 1, orderedIncidentIds]
  );
  return rowCount ?? 0;
}

export async function listHistoryEvents(query: QueryParams) {
  const { whereClause, params, limit } = buildHistoryEventFilters(query);
  const { rows } = await pool.query(
    `SELECT we.id, we.incident_id, we.event_type, we.payload, we.created_at,
            wi.line_id, wi.line_number, wi.machine_id, wi.robot_label, wi.head_number,
            wi.state, wi.status,
            su.first_name, su.last_name, su.role
     FROM workshop_incident_events we
     JOIN workshop_incidents wi ON wi.id = we.incident_id
     LEFT JOIN sentinel_users su ON su.id = we.actor_user_id
     ${whereClause}
     ORDER BY we.created_at DESC
     LIMIT $${params.length + 1}`,
    [...params, limit]
  );

  return rows;
}

export async function listIncidentEvents(incidentId: number) {
  const { rows } = await pool.query(
    `SELECT we.id, we.event_type, we.payload, we.created_at,
            su.first_name, su.last_name, su.role
     FROM workshop_incident_events we
     LEFT JOIN sentinel_users su ON su.id = we.actor_user_id
     WHERE we.incident_id = $1
     ORDER BY we.created_at DESC`,
    [incidentId]
  );

  return rows;
}

export async function getIncidentMetrics(userId: number): Promise<WorkshopIncidentMetricsResult> {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE ${activeIncidentStatusSql})::int AS total,
       COUNT(*) FILTER (WHERE ${openStatusSql})::int AS open_count,
       COUNT(*) FILTER (WHERE ${pendingStatusSql})::int AS pending_count,
       COUNT(*) FILTER (WHERE ${activeIncidentStatusSql} AND is_priority = TRUE)::int AS priority_count,
       COUNT(*) FILTER (WHERE ${activeIncidentStatusSql} AND is_taken = TRUE)::int AS taken_count,
       COUNT(*) FILTER (WHERE ${activeIncidentStatusSql} AND is_taken = FALSE)::int AS not_taken_count,
       COUNT(*) FILTER (WHERE ${activeIncidentStatusSql} AND taken_by_user_id = $1)::int AS assigned_to_me_count,
       COUNT(*) FILTER (WHERE ${openStatusSql}
         AND NOW() - created_at > INTERVAL '7 days')::int AS open_over_7d
     FROM workshop_incidents`,
    [userId]
  );
  const followed = await pool.query(
    `SELECT
       COUNT(*)::int AS followed_count,
       COUNT(*) FILTER (WHERE wi.status IN ('CLOSED', 'CANCELED', 'INVALIDATED'))::int AS followed_resolved_count
     FROM workshop_incident_followers wif
     JOIN workshop_incidents wi ON wi.id = wif.incident_id
     WHERE wif.user_id = $1 AND wif.deleted_at IS NULL`,
    [userId]
  );

  const metrics = rows[0];
  const followMetrics = followed.rows[0];
  return {
    global: {
      total: metrics.total,
      open: metrics.open_count,
      pending: metrics.pending_count,
      priority: metrics.priority_count,
      taken: metrics.taken_count,
      not_taken: metrics.not_taken_count,
      open_over_7d: metrics.open_over_7d,
    },
    personal: {
      assigned_to_me: metrics.assigned_to_me_count,
      followed: followMetrics.followed_count,
      followed_resolved: followMetrics.followed_resolved_count,
    },
    total: metrics.total,
    open: metrics.open_count,
    pending: metrics.pending_count,
    priority: metrics.priority_count,
    taken: metrics.taken_count,
    not_taken: metrics.not_taken_count,
    assigned_to_me: metrics.assigned_to_me_count,
    followed: followMetrics.followed_count,
    followed_resolved: followMetrics.followed_resolved_count,
    open_over_7d: metrics.open_over_7d,
  };
}

export async function incidentExists(incidentId: number): Promise<boolean> {
  const { rowCount } = await pool.query('SELECT 1 FROM workshop_incidents WHERE id = $1', [incidentId]);
  return (rowCount ?? 0) > 0;
}

export async function followIncidentData(incidentId: number, userId: number, client?: PoolClient): Promise<void> {
  const db = client ?? pool;
  await db.query(
    `INSERT INTO workshop_incident_followers (incident_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (incident_id, user_id) WHERE deleted_at IS NULL DO NOTHING`,
    [incidentId, userId]
  );
}

export async function unfollowIncidentData(incidentId: number, userId: number, client?: PoolClient): Promise<void> {
  const db = client ?? pool;
  await db.query(
    `UPDATE workshop_incident_followers
     SET deleted_at = NOW()
     WHERE incident_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [incidentId, userId]
  );
}

export async function getWorkshopAnalytics(query: QueryParams) {
  const { start, end, lineId, machineId } = query;
  const filters: string[] = [nonTerminalRejectedWorkshopIncidentStatusSql];
  const params: Array<string | number> = [];

  if (start) {
    params.push(String(start));
    filters.push(`wi.created_at >= $${params.length}`);
  }
  if (end) {
    params.push(String(end));
    filters.push(`wi.created_at <= $${params.length}`);
  }
  if (lineId) {
    const parsedLine = parseOptionalInt(lineId);
    if (parsedLine !== null) {
      params.push(parsedLine);
      filters.push(`wi.line_id = $${params.length}`);
    }
  }
  if (machineId) {
    params.push(String(machineId));
    filters.push(`wi.machine_id = $${params.length}`);
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

  const { rows: totalsRows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE ${statusInSql('status', INCIDENT_STATUSES.filter((status) => status !== 'CANCELED' && status !== 'INVALIDATED'))})::int AS total,
       COUNT(*) FILTER (WHERE ${openStatusSql})::int AS open_count,
       COUNT(*) FILTER (WHERE ${pendingStatusSql})::int AS pending_count,
       COUNT(*) FILTER (WHERE ${closedStatusSql})::int AS closed_count,
       COUNT(*) FILTER (WHERE is_priority = TRUE)::int AS priority_count,
       COUNT(*) FILTER (WHERE ${activeIncidentStatusSql})::int AS active_count,
       COUNT(*) FILTER (WHERE ${activeIncidentStatusSql} AND is_taken = FALSE)::int AS not_taken_count,
       COUNT(*) FILTER (
         WHERE ${activeIncidentStatusSql}
           AND is_priority = TRUE
           AND is_taken = FALSE
       )::int AS urgent_not_taken_count,
       COUNT(*) FILTER (WHERE taken_at IS NOT NULL)::int AS taken_count,
       COUNT(*) FILTER (
         WHERE ${activeIncidentStatusSql}
           AND NOW() - created_at > INTERVAL '24 hours'
       )::int AS open_over_24h_count,
       COUNT(*) FILTER (
         WHERE ${activeIncidentStatusSql}
           AND NOW() - created_at > INTERVAL '7 days'
       )::int AS open_over_7d_count,
       MAX(EXTRACT(EPOCH FROM (NOW() - created_at))) FILTER (
         WHERE ${activeIncidentStatusSql}
       ) AS oldest_active_seconds,
       percentile_cont(0.5) WITHIN GROUP (
         ORDER BY EXTRACT(EPOCH FROM (taken_at - created_at))
       ) AS median_take_seconds,
       AVG(EXTRACT(EPOCH FROM (taken_at - created_at))) AS avg_take_seconds
     FROM workshop_incidents wi
     ${whereClause}`,
    params
  );

  const { rows: stateRows } = await pool.query(
    `SELECT wi.state, COUNT(*)::int AS count
     FROM workshop_incidents wi
     ${whereClause}
     GROUP BY wi.state
     ORDER BY count DESC`,
    params
  );

  const { rows: lineRows } = await pool.query(
    `SELECT wi.line_number, COUNT(*)::int AS count
     FROM workshop_incidents wi
     ${whereClause}
     GROUP BY wi.line_number
     ORDER BY count DESC`,
    params
  );

  const { rows: machineRows } = await pool.query(
    `SELECT wi.machine_id, COUNT(*)::int AS count
     FROM workshop_incidents wi
     ${whereClause}
     GROUP BY wi.machine_id
     ORDER BY count DESC`,
    params
  );

  const { rows: closeRows } = await pool.query(
    `WITH filtered_incidents AS (
       SELECT wi.id, wi.created_at
       FROM workshop_incidents wi
       ${whereClause}
     ),
     closed_events AS (
       SELECT we.incident_id, MIN(we.created_at) AS closed_at
       FROM workshop_incident_events we
       WHERE we.event_type = 'STATUS_CHANGED'
         AND (we.payload->>'to') = 'CLOSED'
       GROUP BY we.incident_id
     )
     SELECT
       percentile_cont(0.5) WITHIN GROUP (
         ORDER BY EXTRACT(EPOCH FROM (ce.closed_at - fi.created_at))
       ) AS median_close_seconds,
       AVG(EXTRACT(EPOCH FROM (ce.closed_at - fi.created_at))) AS avg_close_seconds
     FROM filtered_incidents fi
     JOIN closed_events ce ON ce.incident_id = fi.id`,
    params
  );

  const { rows: trendRows } = await pool.query(
    `WITH filtered_incidents AS (
       SELECT wi.id, wi.created_at, wi.taken_at, wi.is_priority
       FROM workshop_incidents wi
       ${whereClause}
     ),
     closed_events AS (
       SELECT we.incident_id, MIN(we.created_at) AS closed_at
       FROM workshop_incident_events we
       WHERE we.event_type = 'STATUS_CHANGED'
         AND (we.payload->>'to') = 'CLOSED'
       GROUP BY we.incident_id
     ),
     day_keys AS (
       SELECT date_trunc('day', created_at)::date AS day FROM filtered_incidents
       UNION
       SELECT date_trunc('day', closed_at)::date AS day FROM closed_events ce
       JOIN filtered_incidents fi ON fi.id = ce.incident_id
     )
     SELECT
       dk.day::text AS day,
       COUNT(fi.id) FILTER (WHERE date_trunc('day', fi.created_at)::date = dk.day)::int AS created_count,
       COUNT(ce.incident_id) FILTER (WHERE date_trunc('day', ce.closed_at)::date = dk.day)::int AS closed_count,
       COUNT(fi.id) FILTER (
         WHERE date_trunc('day', fi.created_at)::date = dk.day
           AND fi.is_priority = TRUE
       )::int AS priority_count,
       percentile_cont(0.5) WITHIN GROUP (
         ORDER BY EXTRACT(EPOCH FROM (fi.taken_at - fi.created_at))
       ) FILTER (
         WHERE date_trunc('day', fi.created_at)::date = dk.day
           AND fi.taken_at IS NOT NULL
       ) AS median_take_seconds,
       percentile_cont(0.5) WITHIN GROUP (
         ORDER BY EXTRACT(EPOCH FROM (ce.closed_at - fi.created_at))
       ) FILTER (
         WHERE date_trunc('day', ce.closed_at)::date = dk.day
       ) AS median_close_seconds
     FROM day_keys dk
     LEFT JOIN filtered_incidents fi ON TRUE
     LEFT JOIN closed_events ce ON ce.incident_id = fi.id
     GROUP BY dk.day
     ORDER BY dk.day ASC`,
    params
  );

  const totals = totalsRows[0] || {};
  const closeStats = closeRows[0] || {};

  return {
    total: totals.total ?? 0,
    open: totals.open_count ?? 0,
    pending: totals.pending_count ?? 0,
    closed: totals.closed_count ?? 0,
    priority: totals.priority_count ?? 0,
    active: totals.active_count ?? 0,
    not_taken: totals.not_taken_count ?? 0,
    urgent_not_taken: totals.urgent_not_taken_count ?? 0,
    taken: totals.taken_count ?? 0,
    open_over_24h: totals.open_over_24h_count ?? 0,
    open_over_7d: totals.open_over_7d_count ?? 0,
    oldest_active_seconds: totals.oldest_active_seconds ? Number(totals.oldest_active_seconds) : null,
    median_take_seconds: totals.median_take_seconds ? Number(totals.median_take_seconds) : null,
    avg_take_seconds: totals.avg_take_seconds ? Number(totals.avg_take_seconds) : null,
    median_close_seconds: closeStats.median_close_seconds ? Number(closeStats.median_close_seconds) : null,
    avg_close_seconds: closeStats.avg_close_seconds ? Number(closeStats.avg_close_seconds) : null,
    by_state: stateRows.map((row) => ({ state: row.state, count: row.count })),
    by_line: lineRows.map((row) => ({ line_number: row.line_number, count: row.count })),
    by_machine: machineRows.map((row) => ({ machine_id: row.machine_id, count: row.count })),
    trend: trendRows.map((row) => ({
      day: row.day,
      created: row.created_count,
      closed: row.closed_count,
      priority: row.priority_count,
      median_take_seconds: row.median_take_seconds ? Number(row.median_take_seconds) : null,
      median_close_seconds: row.median_close_seconds ? Number(row.median_close_seconds) : null,
    })),
  };
}
