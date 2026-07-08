import { PoolClient } from 'pg';
import pool from '../../db/pool';
import { boundedInt, parseOptionalInt, statusEqualsSql, statusInSql } from '../../db/sql';
import {
  ACTIVE_INCIDENT_STATUSES,
  INCIDENT_LIST_DEFAULT_LIMIT,
  INCIDENT_LIST_MAX_LIMIT,
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

// ─── SQL column constants ─────────────────────────────────────────────────────

const INCIDENT_BASE_COLS = `wi.id, wi.user_id, wi.line_id, wi.line_number, wi.machine_id, wi.machine_brand,
            wi.robot_label, wi.head_number, wi.state, wi.comment, wi.current_product,
            wi.is_taken, wi.is_priority, wi.status, wi.diagnostic, wi.intervention_note,
            wi.responsible_comment, wi.edit_request, wi.cancel_request, wi.cancel_request_reason,
            wi.taken_by_user_id, wi.taken_at, wi.display_order, wi.created_at, wi.updated_at`;

const INCIDENT_ACTOR_COLS = `COALESCE(wi.declarant_first_name,   su.first_name)    AS first_name,
            COALESCE(wi.declarant_last_name,    su.last_name)     AS last_name,
            COALESCE(wi.declarant_role,         su.role)          AS role,
            COALESCE(wi.declarant_badge_number, su.badge_number)  AS badge_number,
            COALESCE(wi.taken_by_first_name,    tu.first_name)    AS taken_by_first_name,
            COALESCE(wi.taken_by_last_name,     tu.last_name)     AS taken_by_last_name,
            COALESCE(wi.taken_by_role,          tu.role)          AS taken_by_role`;

const INCIDENT_FOLLOWER_COLS = `(wif.id IS NOT NULL) AS is_followed,
            wif.created_at AS followed_at`;

const INCIDENT_USER_JOINS = `JOIN sentinel_users su ON su.id = wi.user_id
     LEFT JOIN sentinel_users tu ON tu.id = wi.taken_by_user_id`;

const INCIDENT_ARBITRATION_COLS = `jsonb_strip_nulls(jsonb_build_object(
            'edit',
              CASE
                WHEN wi.edit_request IS NOT NULL AND edit_arbitration.request_event_id IS NOT NULL
                THEN jsonb_build_object(
                  'requestEventId', edit_arbitration.request_event_id,
                  'requestedAt', edit_arbitration.requested_at,
                  'state', CASE
                    WHEN edit_arbitration.consulted_at IS NULL THEN 'ACTIVE'
                    ELSE 'WAITING'
                  END,
                  'consultedAt', edit_arbitration.consulted_at,
                  'consultedByUserId', edit_arbitration.consulted_by_user_id
                )
              END,
            'cancel',
              CASE
                WHEN wi.cancel_request = TRUE AND cancel_arbitration.request_event_id IS NOT NULL
                THEN jsonb_build_object(
                  'requestEventId', cancel_arbitration.request_event_id,
                  'requestedAt', cancel_arbitration.requested_at,
                  'state', CASE
                    WHEN cancel_arbitration.consulted_at IS NULL THEN 'ACTIVE'
                    ELSE 'WAITING'
                  END,
                  'consultedAt', cancel_arbitration.consulted_at,
                  'consultedByUserId', cancel_arbitration.consulted_by_user_id
                )
              END
          )) AS arbitration`;

const INCIDENT_ARBITRATION_JOINS = `LEFT JOIN LATERAL (
       SELECT we.id AS request_event_id,
              we.created_at AS requested_at,
              wac.consulted_at,
              wac.consulted_by_user_id
       FROM workshop_incident_events we
       LEFT JOIN workshop_arbitration_consultations wac
         ON wac.request_event_id = we.id
       WHERE we.incident_id = wi.id
         AND we.event_type = 'EDIT_REQUESTED'
       ORDER BY we.id DESC
       LIMIT 1
     ) edit_arbitration ON TRUE
     LEFT JOIN LATERAL (
       SELECT we.id AS request_event_id,
              we.created_at AS requested_at,
              wac.consulted_at,
              wac.consulted_by_user_id
       FROM workshop_incident_events we
       LEFT JOIN workshop_arbitration_consultations wac
         ON wac.request_event_id = we.id
       WHERE we.incident_id = wi.id
         AND we.event_type = 'CANCEL_REQUESTED'
       ORDER BY we.id DESC
       LIMIT 1
     ) cancel_arbitration ON TRUE`;

// ─── SQL time interval constants ──────────────────────────────────────────────

const INCIDENT_CRITICAL_AGE = `'7 days'`;

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
  user_id: number;
  cancel_request?: boolean;
  cancel_request_reason?: string | null;
  delete_request?: boolean;
  delete_request_reason?: string | null;
  edit_request?: unknown | null;
}

export interface WorkshopIncidentRow extends CurrentIncident {
  id: number;
  user_id: number;
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
  arbitration?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface IncidentSelection {
  lineNumber: string;
  machineBrand: string;
}

export type ArbitrationRequestType = 'EDIT' | 'CANCEL' | 'ALL';

export interface WorkshopIncidentMetricsResult {
  global?: {
    total: number;
    open: number;
    pending: number;
    priority: number;
    taken: number;
    not_taken: number;
    open_over_7d: number;
    closed_today: number;
  };
  personal?: {
    assigned_to_me: number;
    followed: number;
    followed_resolved: number;
    arbitration_unread: number;
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
  arbitration_unread: number;
  open_over_7d: number;
  closed_today: number;
}

// ─── Shared filter helper ─────────────────────────────────────────────────────

function appendScalarIncidentFilters(
  query: QueryParams,
  filters: string[],
  params: Array<string | number>,
  skipStatus = false
): void {
  const { status, state, lineId, machineId } = query;

  if (!skipStatus && status && isIncidentStatus(String(status))) {
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
}

/**
 * Règle "qu'est-ce qu'une fiche connaissance valide" — CLOSED + note
 * d'intervention non vide. Deux implémentations couplées à maintenir
 * ensemble : ce prédicat JS (utilisé par getKnowledgeIncidentService pour
 * la lecture d'une fiche unique) et le filtre SQL équivalent ci-dessous
 * dans buildIncidentWorkspaceFilters, mode 'knowledge' (utilisé pour la
 * liste). Si la règle évolue, modifier les deux.
 */
export function isKnowledgeEligible(incident: {
  status: string;
  intervention_note: string | null | undefined;
}): boolean {
  return incident.status === 'CLOSED' && Boolean(incident.intervention_note?.trim());
}

/**
 * Construit la clause `(col1 ILIKE $n OR col2 ILIKE $n OR ...)` pour une
 * recherche texte, en poussant le paramètre unique `%q%` et en retournant
 * le fragment SQL. `columns` doit être une liste de colonnes qualifiées
 * (ex. `wi.comment`), différente selon la requête appelante.
 */
function buildFullTextFilter(
  q: string,
  params: Array<string | number>,
  columns: string[]
): string {
  params.push(`%${q}%`);
  const placeholder = `$${params.length}`;
  return `(${columns.map((col) => `${col} ILIKE ${placeholder}`).join('\n      OR ')})`;
}

const INCIDENT_WORKSPACE_SEARCH_COLS = [
  'wi.comment',
  'wi.diagnostic',
  'wi.intervention_note',
  'wi.responsible_comment',
  'wi.machine_id',
  'wi.machine_brand',
  'wi.line_number',
  'wi.robot_label',
  'wi.current_product',
  'su.first_name',
  'su.last_name',
  'tu.first_name',
  'tu.last_name',
];

const HISTORY_EVENT_SEARCH_COLS = [
  'wi.comment',
  'wi.diagnostic',
  'wi.intervention_note',
  'wi.responsible_comment',
  'wi.machine_id',
  'wi.machine_brand',
  'wi.line_number',
  'wi.robot_label',
  'wi.current_product',
  'we.event_type',
  'su.first_name',
  'su.last_name',
];

function buildIncidentWorkspaceFilters(
  query: QueryParams,
  mode: IncidentListMode
): { whereClause: string; params: Array<string | number>; limit: number } {
  const { q, limit } = query;
  const filters: string[] = [];
  const params: Array<string | number> = [];
  const safeLimit = boundedInt(limit, INCIDENT_LIST_DEFAULT_LIMIT, 1, INCIDENT_LIST_MAX_LIMIT);

  if (mode === 'knowledge') {
    // Couplé à isKnowledgeEligible ci-dessus — même règle, dialecte SQL.
    filters.push(statusEqualsSql('wi.status', 'CLOSED'));
    filters.push(`wi.intervention_note IS NOT NULL`);
    filters.push(`btrim(wi.intervention_note) != ''`);
  }

  appendScalarIncidentFilters(query, filters, params, mode === 'knowledge');

  if (q && String(q).trim()) {
    filters.push(buildFullTextFilter(String(q).trim(), params, INCIDENT_WORKSPACE_SEARCH_COLS));
  }

  return {
    whereClause: filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '',
    params,
    limit: safeLimit,
  };
}

function buildHistoryEventFilters(query: QueryParams): {
  whereClause: string;
  params: Array<string | number>;
  limit: number;
} {
  const { q, eventType, limit } = query;
  const filters: string[] = [];
  const params: Array<string | number> = [];
  const safeLimit = boundedInt(limit, INCIDENT_LIST_DEFAULT_LIMIT, 1, INCIDENT_LIST_MAX_LIMIT);

  appendScalarIncidentFilters(query, filters, params);

  if (eventType && String(eventType) !== 'all') {
    params.push(String(eventType));
    filters.push(`we.event_type = $${params.length}`);
  }
  if (q && String(q).trim()) {
    filters.push(buildFullTextFilter(String(q).trim(), params, HISTORY_EVENT_SEARCH_COLS));
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
      `SELECT id, line_id, line_number, machine_id, robot_label,
              head_number, state, current_product, is_taken, is_priority,
              responsible_comment, status, display_order, created_at, updated_at
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
           WHERE ${activeIncidentStatusSql} AND NOW() - created_at > INTERVAL ${INCIDENT_CRITICAL_AGE}
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
    `SELECT ${INCIDENT_BASE_COLS},
            ${INCIDENT_ACTOR_COLS},
            ${INCIDENT_FOLLOWER_COLS},
            ${INCIDENT_ARBITRATION_COLS}
     FROM workshop_incidents wi
     ${INCIDENT_USER_JOINS}
     ${INCIDENT_ARBITRATION_JOINS}
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
  const orderBy =
    mode === 'knowledge'
      ? 'wi.updated_at DESC, wi.created_at DESC'
      : 'wi.created_at DESC, wi.updated_at DESC';

  const { rows } = await pool.query(
    `SELECT ${INCIDENT_BASE_COLS},
            ${INCIDENT_ACTOR_COLS},
            ${INCIDENT_ARBITRATION_COLS}
     FROM workshop_incidents wi
     ${INCIDENT_USER_JOINS}
     ${INCIDENT_ARBITRATION_JOINS}
     ${whereClause}
     ORDER BY ${orderBy}
     LIMIT $${params.length + 1}`,
    [...params, limit]
  );

  return rows;
}

export async function fetchIncidentWithUsers(incidentId: number, actorUserId?: number) {
  const withFollowers = actorUserId !== undefined;
  const followerCols = withFollowers ? `, ${INCIDENT_FOLLOWER_COLS}` : '';
  const followerJoin = withFollowers
    ? `LEFT JOIN workshop_incident_followers wif
       ON wif.incident_id = wi.id
      AND wif.user_id = $2
      AND wif.deleted_at IS NULL`
    : '';

  const { rows } = await pool.query(
    `SELECT ${INCIDENT_BASE_COLS},
            ${INCIDENT_ACTOR_COLS},
            ${INCIDENT_ARBITRATION_COLS}${followerCols}
     FROM workshop_incidents wi
     ${INCIDENT_USER_JOINS}
     ${INCIDENT_ARBITRATION_JOINS}
     ${followerJoin}
     WHERE wi.id = $1`,
    withFollowers ? [incidentId, actorUserId] : [incidentId]
  );

  return rows[0];
}

export function fetchIncidentWithUsersForActor(incidentId: number, actorUserId: number) {
  return fetchIncidentWithUsers(incidentId, actorUserId);
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

export async function createIncidentData(
  input: {
    actorUserId: number;
    data: CreateIncidentInput;
    line: ActiveWorkshopLine;
    machine: StoredMachine;
    robotLabel: string;
  },
  client?: PoolClient
): Promise<number> {
  const db = client ?? pool;
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO workshop_incidents (
      user_id, line_id, line_number, machine_id, machine_brand,
      robot_label, head_number, state, comment, current_product, display_order,
      declarant_first_name, declarant_last_name, declarant_role, declarant_badge_number
     )
     SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
            su.first_name, su.last_name, su.role, su.badge_number
     FROM sentinel_users su
     WHERE su.id = $1
     RETURNING id`,
    [
      input.actorUserId,
      input.line.id,
      input.line.line_number,
      input.machine.machineId,
      input.machine.brand,
      input.robotLabel,
      input.data.headNumber,
      input.data.state,
      input.data.comment || null,
      input.data.currentProduct || null,
      0,
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
    `SELECT status, is_taken, taken_by_user_id, user_id, cancel_request, cancel_request_reason,
            delete_request, delete_request_reason, edit_request
     FROM workshop_incidents
     WHERE id = $1
     FOR UPDATE`,
    [incidentId]
  );

  return rows[0] ?? null;
}

export async function cancelIncidentData(
  incidentId: number,
  client?: PoolClient
): Promise<boolean> {
  const db = client ?? pool;
  const result = await db.query(
    `UPDATE workshop_incidents
     SET status = 'CANCELED',
         cancel_request = FALSE,
         cancel_request_reason = NULL,
         delete_request = FALSE,
         delete_request_reason = NULL,
         edit_request = NULL,
         updated_at = NOW()
     WHERE id = $1`,
    [incidentId]
  );

  return (result.rowCount ?? 0) > 0;
}

export async function getIncidentById(
  incidentId: number,
  client?: PoolClient
): Promise<WorkshopIncidentRow | null> {
  const db = client ?? pool;
  const { rows } = await db.query('SELECT * FROM workshop_incidents WHERE id = $1 FOR UPDATE', [
    incidentId,
  ]);
  return rows[0] ?? null;
}

export async function requestCancelIncident(
  incidentId: number,
  reason: string,
  client?: PoolClient
): Promise<number | null> {
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

export async function requestEditIncident(
  incidentId: number,
  editPayload: Record<string, unknown>,
  client?: PoolClient
): Promise<number | null> {
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

export async function rejectEditIncident(
  incidentId: number,
  client?: PoolClient
): Promise<number | null> {
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

export async function rejectCancelIncident(
  incidentId: number,
  client?: PoolClient
): Promise<number | null> {
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

export async function applyEditRequestIncident(
  input: {
    incidentId: number;
    current: WorkshopIncidentRow;
    requested: Record<string, unknown>;
    selection: IncidentSelection;
  },
  client?: PoolClient
): Promise<number> {
  const db = client ?? pool;
  const requested = input.requested;
  const { rows } = await db.query<{ id: number }>(
    `UPDATE workshop_incidents
     SET line_id = $1, line_number = $2, machine_id = $3, machine_brand = $4,
         robot_label = $5, head_number = $6, state = $7, comment = $8, current_product = $9,
         edit_request = NULL, updated_at = NOW()
     WHERE id = $10
     RETURNING id`,
    [
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

export async function invalidateIncident(
  incidentId: number,
  client?: PoolClient
): Promise<number | null> {
  const db = client ?? pool;
  const { rows } = await db.query<{ id: number }>(
    `UPDATE workshop_incidents
     SET status = 'INVALIDATED',
         cancel_request = FALSE,
         cancel_request_reason = NULL,
         delete_request = FALSE,
         delete_request_reason = NULL,
         edit_request = NULL,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id`,
    [incidentId]
  );

  return rows[0]?.id ?? null;
}

// Dette connue : le UPDATE ci-dessous réécrit systématiquement les 18
// colonnes (via updates.X ?? current.X), même quand une mutation ne change
// qu'un seul champ (ex. SET_PRIORITY ne touche que is_priority). Un UPDATE
// dynamique (clause SET construite selon les champs réellement fournis)
// réduirait l'écriture, mais c'est une fonction appelée par toutes les
// mutations de workflow — la retoucher pour un gain de perf marginal sur
// ce volume de données n'est pas justifié à ce stade.
export async function updateIncidentData(
  input: {
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
  },
  client?: PoolClient
): Promise<number | null> {
  const db = client ?? pool;
  const { current, updates } = input;
  const tookOwnership = updates.isTaken === true && !current.is_taken;
  const nextTakenByUserId = tookOwnership ? input.actorUserId : current.taken_by_user_id;
  const nextTakenAt = tookOwnership ? new Date() : current.taken_at;

  const { rows } = await db.query<{ id: number }>(
    `UPDATE workshop_incidents
     SET line_id = $1, line_number = $2, machine_id = $3, machine_brand = $4,
         robot_label = $5, head_number = $6, state = $7, comment = $8, current_product = $9,
         is_taken = $10, is_priority = $11, status = $12, diagnostic = $13,
         intervention_note = $14, responsible_comment = $15,
         taken_by_user_id = $16, taken_at = $17, display_order = $18, updated_at = NOW()
     WHERE id = $19
     RETURNING id`,
    [
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
      input.role === 'RESPONSABLE'
        ? updates.responsibleComment !== undefined
          ? updates.responsibleComment.trim() === ''
            ? null
            : updates.responsibleComment
          : current.responsible_comment
        : current.responsible_comment,
      nextTakenByUserId,
      nextTakenAt,
      current.display_order,
      input.incidentId,
    ]
  );

  if (tookOwnership && rows[0]?.id) {
    await db.query(
      `UPDATE workshop_incidents wi
       SET taken_by_first_name = su.first_name,
           taken_by_last_name  = su.last_name,
           taken_by_role       = su.role
       FROM sentinel_users su
       WHERE wi.id = $1 AND su.id = $2`,
      [input.incidentId, input.actorUserId]
    );
  }

  return rows[0]?.id ?? null;
}

export async function listHistoryEvents(query: QueryParams) {
  const { whereClause, params, limit } = buildHistoryEventFilters(query);
  const { rows } = await pool.query(
    `SELECT we.id, we.incident_id, we.event_type, we.payload, we.created_at,
            wi.line_id, wi.line_number, wi.machine_id, wi.robot_label, wi.head_number,
            wi.state, wi.status,
            COALESCE(we.actor_first_name,    su.first_name)    AS first_name,
            COALESCE(we.actor_last_name,     su.last_name)     AS last_name,
            COALESCE(we.actor_role,          su.role)          AS role,
            COALESCE(we.actor_badge_number,  su.badge_number)  AS badge_number
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
            COALESCE(we.actor_first_name,    su.first_name)    AS first_name,
            COALESCE(we.actor_last_name,     su.last_name)     AS last_name,
            COALESCE(we.actor_role,          su.role)          AS role,
            COALESCE(we.actor_badge_number,  su.badge_number)  AS badge_number
     FROM workshop_incident_events we
     LEFT JOIN sentinel_users su ON su.id = we.actor_user_id
     WHERE we.incident_id = $1
     ORDER BY we.created_at DESC`,
    [incidentId]
  );

  return rows;
}

export async function getIncidentMetrics(
  userId: number,
  role: string
): Promise<WorkshopIncidentMetricsResult> {
  const [{ rows }, followed, unconsultedArbitration] = await Promise.all([
    pool.query(
      `SELECT
       COUNT(*) FILTER (WHERE ${activeIncidentStatusSql})::int AS total,
       COUNT(*) FILTER (WHERE ${openStatusSql})::int AS open_count,
       COUNT(*) FILTER (WHERE ${pendingStatusSql})::int AS pending_count,
       COUNT(*) FILTER (WHERE ${activeIncidentStatusSql} AND is_priority = TRUE)::int AS priority_count,
       COUNT(*) FILTER (WHERE ${activeIncidentStatusSql} AND is_taken = TRUE)::int AS taken_count,
       COUNT(*) FILTER (WHERE ${activeIncidentStatusSql} AND is_taken = FALSE)::int AS not_taken_count,
       COUNT(*) FILTER (WHERE ${activeIncidentStatusSql} AND taken_by_user_id = $1)::int AS assigned_to_me_count,
       COUNT(*) FILTER (WHERE ${activeIncidentStatusSql}
         AND NOW() - created_at > INTERVAL ${INCIDENT_CRITICAL_AGE})::int AS open_over_7d,
       COUNT(*) FILTER (WHERE status = 'CLOSED'
         AND updated_at >= CURRENT_DATE AND updated_at < CURRENT_DATE + INTERVAL '1 day')::int AS closed_today
     FROM workshop_incidents`,
      [userId]
    ),
    pool.query(
      `SELECT
       COUNT(*)::int AS followed_count,
       COUNT(*) FILTER (WHERE wi.status IN ('CLOSED', 'CANCELED', 'INVALIDATED'))::int AS followed_resolved_count
     FROM workshop_incident_followers wif
     JOIN workshop_incidents wi ON wi.id = wif.incident_id
     WHERE wif.user_id = $1 AND wif.deleted_at IS NULL`,
      [userId]
    ),
    role === 'RESPONSABLE' ? countUnconsultedArbitrationIncidents() : Promise.resolve(0),
  ]);

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
      closed_today: metrics.closed_today,
    },
    personal: {
      assigned_to_me: metrics.assigned_to_me_count,
      followed: followMetrics.followed_count,
      followed_resolved: followMetrics.followed_resolved_count,
      arbitration_unread: unconsultedArbitration,
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
    arbitration_unread: unconsultedArbitration,
    open_over_7d: metrics.open_over_7d,
    closed_today: metrics.closed_today,
  };
}

// Dette connue : cette requête et consultArbitrationRequest ci-dessous
// (ainsi que INCIDENT_ARBITRATION_COLS/JOINS plus haut) réimplémentent
// chacune la même logique "dernière demande EDIT/CANCEL active par
// incident" en SQL brut, à 4 endroits. Elles ne sont pas identiques (COUNT
// vs INSERT, filtrage par incident vs global, projection différente) : les
// factoriser proprement demanderait une vue ou fonction SQL PostgreSQL
// partagée, donc une migration de schéma — hors scope d'un nettoyage
// cosmétique. Si la logique d'arbitrage évolue, modifier les 4 endroits.
export async function countUnconsultedArbitrationIncidents(): Promise<number> {
  const { rows } = await pool.query<{ unread_count: number }>(
    `WITH active_requests AS (
       SELECT wi.id AS incident_id, edit_request.request_event_id
       FROM workshop_incidents wi
       JOIN LATERAL (
         SELECT we.id AS request_event_id
         FROM workshop_incident_events we
         WHERE we.incident_id = wi.id
           AND we.event_type = 'EDIT_REQUESTED'
         ORDER BY we.id DESC
         LIMIT 1
       ) edit_request ON TRUE
       WHERE wi.status IN ('OPEN', 'PENDING')
         AND wi.edit_request IS NOT NULL
       UNION ALL
       SELECT wi.id AS incident_id, cancel_request.request_event_id
       FROM workshop_incidents wi
       JOIN LATERAL (
         SELECT we.id AS request_event_id
         FROM workshop_incident_events we
         WHERE we.incident_id = wi.id
           AND we.event_type = 'CANCEL_REQUESTED'
         ORDER BY we.id DESC
         LIMIT 1
       ) cancel_request ON TRUE
       WHERE wi.status IN ('OPEN', 'PENDING')
         AND wi.cancel_request = TRUE
     )
     SELECT COUNT(*)::int AS unread_count
     FROM (
       SELECT DISTINCT ar.incident_id
       FROM active_requests ar
       LEFT JOIN workshop_arbitration_consultations wac
         ON wac.request_event_id = ar.request_event_id
       WHERE wac.request_event_id IS NULL
     ) unconsulted`
  );

  return rows[0]?.unread_count ?? 0;
}

export async function consultArbitrationRequest(
  incidentId: number,
  userId: number,
  requestType: ArbitrationRequestType
): Promise<number> {
  const { rowCount } = await pool.query(
    `WITH active_requests AS (
       SELECT wi.id AS incident_id, 'EDIT'::text AS request_type, edit_request.request_event_id
       FROM workshop_incidents wi
       JOIN LATERAL (
         SELECT we.id AS request_event_id
         FROM workshop_incident_events we
         WHERE we.incident_id = wi.id
           AND we.event_type = 'EDIT_REQUESTED'
         ORDER BY we.id DESC
         LIMIT 1
       ) edit_request ON TRUE
       WHERE wi.id = $1
         AND wi.status IN ('OPEN', 'PENDING')
         AND wi.edit_request IS NOT NULL
         AND $3 IN ('EDIT', 'ALL')
       UNION ALL
       SELECT wi.id AS incident_id, 'CANCEL'::text AS request_type, cancel_request.request_event_id
       FROM workshop_incidents wi
       JOIN LATERAL (
         SELECT we.id AS request_event_id
         FROM workshop_incident_events we
         WHERE we.incident_id = wi.id
           AND we.event_type = 'CANCEL_REQUESTED'
         ORDER BY we.id DESC
         LIMIT 1
       ) cancel_request ON TRUE
       WHERE wi.id = $1
         AND wi.status IN ('OPEN', 'PENDING')
         AND wi.cancel_request = TRUE
         AND $3 IN ('CANCEL', 'ALL')
     )
     INSERT INTO workshop_arbitration_consultations
       (request_event_id, incident_id, request_type, consulted_by_user_id)
     SELECT request_event_id, incident_id, request_type, $2
     FROM active_requests
     ON CONFLICT (request_event_id) DO NOTHING`,
    [incidentId, userId, requestType]
  );

  return rowCount ?? 0;
}

export async function incidentExists(incidentId: number): Promise<boolean> {
  const { rowCount } = await pool.query('SELECT 1 FROM workshop_incidents WHERE id = $1', [
    incidentId,
  ]);
  return (rowCount ?? 0) > 0;
}

export async function getIncidentStatus(
  incidentId: number
): Promise<{ status: IncidentStatus } | null> {
  const { rows } = await pool.query<{ status: IncidentStatus }>(
    'SELECT status FROM workshop_incidents WHERE id = $1',
    [incidentId]
  );
  return rows[0] ?? null;
}

export async function followIncidentData(
  incidentId: number,
  userId: number,
  client?: PoolClient
): Promise<void> {
  const db = client ?? pool;
  await db.query(
    `INSERT INTO workshop_incident_followers (incident_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (incident_id, user_id) WHERE deleted_at IS NULL DO NOTHING`,
    [incidentId, userId]
  );
}

export async function unfollowIncidentData(
  incidentId: number,
  userId: number,
  client?: PoolClient
): Promise<void> {
  const db = client ?? pool;
  await db.query(
    `UPDATE workshop_incident_followers
     SET deleted_at = NOW()
     WHERE incident_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [incidentId, userId]
  );
}

export { getWorkshopAnalytics } from './workshop.repository.analytics';
