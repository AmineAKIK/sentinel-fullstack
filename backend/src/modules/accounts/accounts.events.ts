import { PoolClient } from 'pg';
import pool from '../../db/pool';

/** Identité figée dans l'événement d'audit (snapshot au moment de l'action). */
export interface TargetIdentitySnapshot {
  firstName: string;
  lastName: string;
  badgeNumber: string;
}

export async function createAccountAuditEvent(
  targetUserId: number,
  adminId: number,
  eventType: string,
  changes: Record<string, unknown> | null,
  client?: PoolClient,
  // Identité à figer. Si omise, on capture l'état courant de l'utilisateur via
  // un sous-SELECT. À fournir explicitement quand l'utilisateur vient d'être
  // anonymisé dans la même transaction (suppression) — sinon on figerait ANON.
  identity?: TargetIdentitySnapshot
): Promise<void> {
  const db = client ?? pool;
  const changesJson = changes ? JSON.stringify(changes) : null;

  if (identity) {
    await db.query(
      `INSERT INTO account_audit_events
         (target_user_id, admin_id, event_type, changes,
          target_first_name, target_last_name, target_badge_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [targetUserId, adminId, eventType, changesJson, identity.firstName, identity.lastName, identity.badgeNumber]
    );
    return;
  }

  // Snapshot de l'identité courante au moment de l'écriture.
  await db.query(
    `INSERT INTO account_audit_events
       (target_user_id, admin_id, event_type, changes,
        target_first_name, target_last_name, target_badge_number)
     SELECT $1, $2, $3, $4, su.first_name, su.last_name, su.badge_number
     FROM sentinel_users su
     WHERE su.id = $1`,
    [targetUserId, adminId, eventType, changesJson]
  );
}
