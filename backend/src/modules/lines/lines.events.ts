import { PoolClient } from 'pg';
import pool from '../../db/pool';

export async function createLineAuditEvent(
  targetLineId: number,
  adminId: number,
  eventType: string,
  changes: Record<string, unknown> | null,
  client?: PoolClient
): Promise<void> {
  const db = client ?? pool;
  const { rowCount } = await db.query(
    `INSERT INTO line_audit_events
       (target_line_id, target_line_number, admin_id, event_type, changes)
     SELECT pl.id, pl.line_number, $2, $3, $4
     FROM production_lines pl
     WHERE pl.id = $1`,
    [targetLineId, adminId, eventType, changes ? JSON.stringify(changes) : null]
  );
  if (!rowCount) {
    throw new Error(`createLineAuditEvent: ligne ${targetLineId} introuvable`);
  }
}
