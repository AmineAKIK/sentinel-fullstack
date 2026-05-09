import pool from '../../db/pool';

export async function createAccountAuditEvent(
  targetUserId: number,
  adminId: number,
  eventType: string,
  changes: Record<string, unknown> | null
): Promise<void> {
  await pool.query(
    `INSERT INTO account_audit_events (target_user_id, admin_id, event_type, changes)
     VALUES ($1, $2, $3, $4)`,
    [targetUserId, adminId, eventType, changes ? JSON.stringify(changes) : null]
  );
}
