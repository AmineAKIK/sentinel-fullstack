import { PoolClient } from 'pg';
import pool from '../../db/pool';
import logger from '../../logger';

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
  | 'EDIT_REQUEST_WITHDRAWN'
  | 'CANCEL_REQUESTED'
  | 'CANCEL_REQUEST_REJECTED'
  | 'ARBITRATION_CONSULTED'
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
      `INSERT INTO workshop_incident_events
         (incident_id, actor_user_id, event_type, payload,
          actor_first_name, actor_last_name, actor_role, actor_badge_number)
       SELECT $1, $2, $3, $4,
              su.first_name, su.last_name, su.role, su.badge_number
       FROM sentinel_users su
       WHERE su.id = $2`,
      [incidentId, actorUserId, eventType, payload ? JSON.stringify(payload) : null]
    );
  } catch (err) {
    logger.error({ err, eventType, incidentId }, 'Failed to log incident event');
    throw err;
  }
}
