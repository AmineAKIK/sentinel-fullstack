import pool from '../../db/pool';
import type { PoolClient } from 'pg';

export async function createAdminSystemAuditEvent(
  adminId: number,
  eventType: string,
  changes: Record<string, unknown> | null,
  client?: PoolClient
): Promise<void> {
  const db = client ?? pool;
  await db.query(
    `INSERT INTO admin_system_audit_events (admin_id, event_type, changes)
     VALUES ($1, $2, $3)`,
    [adminId, eventType, changes ? JSON.stringify(changes) : null]
  );
}
