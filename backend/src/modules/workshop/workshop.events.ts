import { PoolClient } from 'pg';
import pool from '../../db/pool';
import logger from '../../logger';
import { enqueueIncidentNotification } from '../notifications/notificationOutbox.repository';

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
  | 'CANCEL_REQUEST_WITHDRAWN'
  | 'ARBITRATION_CONSULTED'
  | 'PRIORITY_CHANGED'
  | 'ORDER_CHANGED'
  | 'RESPONSIBLE_COMMENT_UPDATED'
  | 'STATUS_CHANGED';

export type IncidentEventActor =
  | { kind: 'WORKSHOP_USER'; userId: number }
  | { kind: 'ADMIN'; adminId: number }
  | { kind: 'SYSTEM'; displayName: string };

function normalizeActor(actor: number | IncidentEventActor): IncidentEventActor {
  return typeof actor === 'number' ? { kind: 'WORKSHOP_USER', userId: actor } : actor;
}

export async function logIncidentEvent(
  incidentId: number,
  actorInput: number | IncidentEventActor,
  eventType: IncidentEventType,
  payload?: Record<string, unknown>,
  client?: PoolClient
): Promise<number> {
  const db = client ?? pool;
  const actor = normalizeActor(actorInput);
  try {
    const serializedPayload = payload ? JSON.stringify(payload) : null;
    const result =
      actor.kind === 'WORKSHOP_USER'
        ? await db.query<{ id: number }>(
            `INSERT INTO workshop_incident_events
             (incident_id, actor_user_id, actor_kind, event_type, payload,
              actor_first_name, actor_last_name, actor_role, actor_badge_number, actor_display_name)
           SELECT $1, $2, 'WORKSHOP_USER', $3, $4,
                  su.first_name, su.last_name, su.role, su.badge_number,
                  NULLIF(CONCAT_WS(' ', su.first_name, su.last_name), '')
           FROM sentinel_users su
           WHERE su.id = $2
           RETURNING id`,
            [incidentId, actor.userId, eventType, serializedPayload]
          )
        : actor.kind === 'ADMIN'
          ? await db.query<{ id: number }>(
              `INSERT INTO workshop_incident_events
               (incident_id, actor_user_id, actor_kind, actor_admin_id, event_type, payload,
                actor_first_name, actor_role, actor_display_name)
             SELECT $1, NULL, 'ADMIN', aa.id, $3, $4, aa.username, 'ADMIN', aa.username
             FROM admin_accounts aa
             WHERE aa.id = $2
             RETURNING id`,
              [incidentId, actor.adminId, eventType, serializedPayload]
            )
          : await db.query<{ id: number }>(
              `INSERT INTO workshop_incident_events
               (incident_id, actor_user_id, actor_kind, event_type, payload,
                actor_first_name, actor_role, actor_display_name)
             VALUES ($1, NULL, 'SYSTEM', $2, $3, $4, 'SYSTEM', $4)
             RETURNING id`,
              [incidentId, eventType, serializedPayload, actor.displayName]
            );
    const eventId = result.rows[0]?.id;
    if (!eventId) {
      throw new Error(
        `logIncidentEvent: aucun événement inséré pour actor=${JSON.stringify(actor)}`
      );
    }
    await enqueueIncidentNotification(eventId, eventType, actor.kind, client);
    return eventId;
  } catch (err) {
    logger.error({ err, eventType, incidentId }, 'Failed to log incident event');
    throw err;
  }
}
