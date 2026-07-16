import { PoolClient } from 'pg';
import pool from '../../db/pool';

export type ArbitrationRequestType = 'EDIT' | 'CANCEL';
export type ArbitrationOpenStatus = 'ACTIVE' | 'CONSULTED';
export type ArbitrationResolution = 'APPROVED' | 'REJECTED' | 'WITHDRAWN' | 'SUPERSEDED';

export interface OpenArbitrationCase {
  id: number;
  incident_id: number;
  request_event_id: number | null;
  request_type: ArbitrationRequestType;
  status: ArbitrationOpenStatus;
  payload: Record<string, unknown> | null;
  reason: string | null;
  requested_by_user_id: number;
  requested_at: Date;
  consulted_by_user_id: number | null;
  consulted_at: Date | null;
}

export async function getOpenArbitrationCase(
  incidentId: number,
  client?: PoolClient
): Promise<OpenArbitrationCase | null> {
  const db = client ?? pool;
  const { rows } = await db.query<OpenArbitrationCase>(
    `SELECT id::int AS id, incident_id, request_event_id, request_type, status, payload, reason,
            requested_by_user_id, requested_at, consulted_by_user_id, consulted_at
     FROM workshop_arbitration_cases
     WHERE incident_id = $1 AND status IN ('ACTIVE', 'CONSULTED')
     FOR UPDATE`,
    [incidentId]
  );
  return rows[0] ?? null;
}

export async function createArbitrationCase(
  input: {
    incidentId: number;
    requestEventId: number;
    requestType: ArbitrationRequestType;
    payload?: Record<string, unknown>;
    reason?: string;
    requestedByUserId: number;
  },
  client?: PoolClient
): Promise<number> {
  const db = client ?? pool;
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO workshop_arbitration_cases
       (incident_id, request_event_id, request_type, status, payload, reason,
        requested_by_user_id, requested_at)
     VALUES ($1, $2, $3, 'ACTIVE', $4, $5, $6, NOW())
     RETURNING id::int AS id`,
    [
      input.incidentId,
      input.requestEventId,
      input.requestType,
      input.payload ? JSON.stringify(input.payload) : null,
      input.reason ?? null,
      input.requestedByUserId,
    ]
  );
  return rows[0].id;
}

export async function consultArbitrationCase(
  incidentId: number,
  requestType: ArbitrationRequestType,
  userId: number,
  client?: PoolClient
): Promise<OpenArbitrationCase | null> {
  const db = client ?? pool;
  const { rows } = await db.query<OpenArbitrationCase>(
    `UPDATE workshop_arbitration_cases
     SET status = 'CONSULTED', consulted_by_user_id = $3, consulted_at = NOW(), updated_at = NOW()
     WHERE incident_id = $1 AND request_type = $2 AND status = 'ACTIVE'
     RETURNING id::int AS id, incident_id, request_event_id, request_type, status, payload, reason,
               requested_by_user_id, requested_at, consulted_by_user_id, consulted_at`,
    [incidentId, requestType, userId]
  );
  if (rows[0]) return rows[0];
  return getOpenArbitrationCase(incidentId, client);
}

export async function resolveArbitrationCase(
  incidentId: number,
  requestType: ArbitrationRequestType,
  resolution: ArbitrationResolution,
  decidedByUserId: number | null,
  decisionReason: string | null,
  client?: PoolClient
): Promise<number | null> {
  const db = client ?? pool;
  const { rows } = await db.query<{ id: number }>(
    `UPDATE workshop_arbitration_cases
     SET status = $3, decided_by_user_id = $4, decided_at = NOW(),
         decision_reason = $5, updated_at = NOW()
     WHERE incident_id = $1 AND request_type = $2 AND status IN ('ACTIVE', 'CONSULTED')
     RETURNING id::int AS id`,
    [incidentId, requestType, resolution, decidedByUserId, decisionReason]
  );
  return rows[0]?.id ?? null;
}

export async function supersedeOpenArbitrationCases(
  incidentIds: number[],
  decisionReason: string,
  client?: PoolClient
): Promise<number> {
  if (incidentIds.length === 0) return 0;

  const db = client ?? pool;
  const result = await db.query(
    `UPDATE workshop_arbitration_cases
     SET status = 'SUPERSEDED', decided_by_user_id = NULL, decided_at = NOW(),
         decision_reason = $2, updated_at = NOW()
     WHERE incident_id = ANY($1::int[]) AND status IN ('ACTIVE', 'CONSULTED')`,
    [incidentIds, decisionReason]
  );
  return result.rowCount ?? 0;
}

export async function countActiveArbitrationIncidents(): Promise<number> {
  const { rows } = await pool.query<{ count: number }>(
    `SELECT COUNT(DISTINCT incident_id)::int AS count
     FROM workshop_arbitration_cases
     WHERE status = 'ACTIVE'`
  );
  return rows[0]?.count ?? 0;
}
