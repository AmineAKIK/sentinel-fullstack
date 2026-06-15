import { PoolClient } from 'pg';
import pool from '../../db/pool';
import { statusInSql } from '../../db/sql';
import { ACTIVE_INCIDENT_STATUSES } from '../../domain/constants';
import { CreateLineInput, UpdateLineInput } from './lines.validation';

export interface LineMachineDto {
  machineId: string;
  brand?: string;
  machineType?: string;
  position?: string;
  hasDoubleRobot?: boolean;
  robotA?: string;
  robotB?: string;
}

export interface LineDto {
  id: number;
  line_number: string;
  machines: LineMachineDto[];
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface LineForUpdateDto {
  line_number: string;
  is_active: boolean;
  machine_sequence: Array<{ machineId: string }>;
}

export interface LineImpactDto {
  incidents: number;
  open_or_pending_incidents: number;
}

const lineSelect = 'id, line_number, machine_sequence AS machines, is_active, created_at, updated_at';

export async function listLinesData(): Promise<LineDto[]> {
  const { rows } = await pool.query<LineDto>(
    `SELECT ${lineSelect}
     FROM production_lines
     WHERE is_deleted = FALSE
     ORDER BY created_at DESC`
  );

  return rows;
}

export async function lineNumberExists(lineNumber: string, excludeLineId?: number): Promise<boolean> {
  const params: unknown[] = [lineNumber];
  const excludeClause = excludeLineId ? 'AND id != $2' : '';
  if (excludeLineId) params.push(excludeLineId);

  const { rows } = await pool.query<{ id: number }>(
    `SELECT id FROM production_lines
     WHERE line_number = $1 AND is_deleted = FALSE ${excludeClause}`,
    params
  );

  return rows.length > 0;
}

export async function createLineData(input: CreateLineInput, client?: PoolClient): Promise<LineDto> {
  const db = client ?? pool;
  const { rows } = await db.query<LineDto>(
    `INSERT INTO production_lines (line_number, machine_sequence, is_active)
     VALUES ($1, $2, $3)
     RETURNING ${lineSelect}`,
    [input.lineNumber, JSON.stringify(input.machines), input.isActive ?? true]
  );

  return rows[0];
}

export async function getLineData(id: number): Promise<LineDto | null> {
  const { rows } = await pool.query<LineDto>(
    `SELECT ${lineSelect}
     FROM production_lines
     WHERE id = $1 AND is_deleted = FALSE`,
    [id]
  );

  return rows[0] ?? null;
}

export async function getLineForUpdate(id: number): Promise<LineForUpdateDto | null> {
  const { rows } = await pool.query<LineForUpdateDto>(
    `SELECT line_number, is_active, machine_sequence
     FROM production_lines
     WHERE id = $1 AND is_deleted = FALSE`,
    [id]
  );

  return rows[0] ?? null;
}

export async function updateLineData(id: number, updates: UpdateLineInput, client?: PoolClient): Promise<LineDto | null> {
  const db = client ?? pool;
  const setClauses: string[] = ['updated_at = NOW()'];
  const params: unknown[] = [];

  if (updates.lineNumber !== undefined) {
    params.push(updates.lineNumber);
    setClauses.push(`line_number = $${params.length}`);
  }
  if (updates.machines !== undefined) {
    params.push(JSON.stringify(updates.machines));
    setClauses.push(`machine_sequence = $${params.length}`);
  }
  if (updates.isActive !== undefined) {
    params.push(updates.isActive);
    setClauses.push(`is_active = $${params.length}`);
  }

  params.push(id);
  const { rows } = await db.query<LineDto>(
    `UPDATE production_lines SET ${setClauses.join(', ')}
     WHERE id = $${params.length} AND is_deleted = FALSE
     RETURNING ${lineSelect}`,
    params
  );

  return rows[0] ?? null;
}

export async function softDeleteLine(id: number, client?: PoolClient): Promise<boolean> {
  const db = client ?? pool;
  const { rows } = await db.query<{ id: number }>(
    `UPDATE production_lines
     SET is_deleted = TRUE, deleted_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND is_deleted = FALSE
     RETURNING id`,
    [id]
  );

  return rows.length > 0;
}

export async function getLineImpactData(id: number): Promise<LineImpactDto> {
  const { rows } = await pool.query<LineImpactDto>(
    `SELECT
       COUNT(*)::int AS incidents,
       COUNT(*) FILTER (WHERE ${statusInSql('status', ACTIVE_INCIDENT_STATUSES)})::int AS open_or_pending_incidents
     FROM workshop_incidents
     WHERE line_id = $1`,
    [id]
  );

  return rows[0] || { incidents: 0, open_or_pending_incidents: 0 };
}

export async function findMachineConflicts(machineIds: string[], excludeLineId?: number): Promise<string[]> {
  if (machineIds.length === 0) return [];
  const normalized = machineIds.map((id) => id.trim().toLowerCase()).filter(Boolean);
  if (normalized.length === 0) return [];

  const params: unknown[] = [normalized];
  const excludeClause = excludeLineId ? 'AND pl.id != $2' : '';
  if (excludeLineId) params.push(excludeLineId);

  const { rows } = await pool.query<{ machine_id: string }>(
    `SELECT DISTINCT elem->>'machineId' AS machine_id
     FROM production_lines pl
     CROSS JOIN LATERAL jsonb_array_elements(pl.machine_sequence) elem
     WHERE pl.is_deleted = FALSE
       ${excludeClause}
       AND lower(elem->>'machineId') = ANY($1)`,
    params
  );

  return rows.map((row) => row.machine_id);
}

export async function getActiveIncidentCountForLine(lineId: number): Promise<number> {
  const { rows } = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
     FROM workshop_incidents
     WHERE line_id = $1 AND ${statusInSql('status', ACTIVE_INCIDENT_STATUSES)}`,
    [lineId]
  );

  return rows[0]?.count ?? 0;
}
