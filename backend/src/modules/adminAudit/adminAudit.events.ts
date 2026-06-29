import pool from '../../db/pool';

export async function createAdminSystemAuditEvent(
  adminId: number,
  eventType: string,
  changes: Record<string, unknown> | null
): Promise<void> {
  await pool.query(
    `INSERT INTO admin_system_audit_events (admin_id, event_type, changes)
     VALUES ($1, $2, $3)`,
    [adminId, eventType, changes ? JSON.stringify(changes) : null]
  );
}
