import pool from '../../db/pool';

export async function createLineAuditEvent(
  targetLineId: number,
  adminId: number,
  eventType: string,
  changes: Record<string, unknown> | null
): Promise<void> {
  await pool.query(
    `INSERT INTO line_audit_events (target_line_id, admin_id, event_type, changes)
     VALUES ($1, $2, $3, $4)`,
    [targetLineId, adminId, eventType, changes ? JSON.stringify(changes) : null]
  );
}
