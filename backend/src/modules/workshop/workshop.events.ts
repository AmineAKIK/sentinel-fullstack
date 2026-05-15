import { PoolClient } from 'pg';
import pool from '../../db/pool';

export type IncidentEventType =
  | 'INCIDENT_CREATED'
  | 'INCIDENT_UPDATED'
  | 'INCIDENT_TAKEN'
  | 'INCIDENT_SET_PENDING'
  | 'INCIDENT_RESUMED'
  | 'INCIDENT_CLOSED'
  | 'INCIDENT_CANCELED'
  | 'INCIDENT_INVALIDATED'
  | 'INCIDENT_FOLLOWED'
  | 'INCIDENT_UNFOLLOWED'
  | 'INCIDENT_REORDERED'
  | 'EDIT_REQUESTED'
  | 'EDIT_APPLIED'
  | 'EDIT_REJECTED'
  | 'CANCEL_REQUESTED'
  | 'CANCEL_REQUEST_REJECTED'
  | 'PRIORITY_CHANGED'
  | 'ORDER_CHANGED'
  | 'RESPONSIBLE_COMMENT_UPDATED'
  | 'STATUS_CHANGED';

export async function logIncidentEvent(
  incidentId: number,
  actorUserId: number,
  eventType: IncidentEventType,
  payload?: Record<string, unknown>,
  client?: PoolClient
): Promise<void> {
  const db = client ?? pool;
  try {
    await db.query(
      `INSERT INTO workshop_incident_events (incident_id, actor_user_id, event_type, payload)
       VALUES ($1, $2, $3, $4)`,
      [incidentId, actorUserId, eventType, payload ? JSON.stringify(payload) : null]
    );
  } catch (err) {
    console.error(`[audit] Failed to log event ${eventType} for incident ${incidentId}:`, err);
    throw err;
  }
}
