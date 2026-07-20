import { PoolClient } from 'pg';
import pool from '../../db/pool';
import { withTransaction } from '../../db/transaction';
import type { IncidentEventType } from '../workshop/workshop.events';

const NOTIFIABLE_INCIDENT_EVENTS = new Set<IncidentEventType>([
  'INCIDENT_TAKEN',
  'INCIDENT_SET_PENDING',
  'INCIDENT_CLOSED',
  'INCIDENT_CANCELED',
  'INCIDENT_INVALIDATED',
  'EDIT_REQUESTED',
  'EDIT_APPLIED',
  'EDIT_REJECTED',
  'CANCEL_REQUESTED',
  'CANCEL_REQUEST_REJECTED',
  'PRIORITY_CHANGED',
  'RESPONSIBLE_COMMENT_UPDATED',
]);

// Canal (nom de fonction notify*) -> adresses déjà confirmées livrées.
export type DeliveredRecipientsByChannel = Record<string, string[]>;

export interface NotificationOutboxItem {
  id: string;
  source: 'INCIDENT_EVENT' | 'PASSWORD_RESET';
  attempt_count: number;
  incident_id: number | null;
  event_type: IncidentEventType | null;
  payload: Record<string, unknown> | null;
  actor_user_id: number | null;
  reset_first_name: string | null;
  reset_last_name: string | null;
  reset_badge_number: string | null;
  reset_requested_at: Date | null;
  delivered_recipients: DeliveredRecipientsByChannel;
}

export async function enqueueIncidentNotification(
  eventId: number,
  eventType: IncidentEventType,
  actorKind: 'WORKSHOP_USER' | 'ADMIN' | 'SYSTEM',
  client?: PoolClient
): Promise<void> {
  if (actorKind !== 'WORKSHOP_USER' || !NOTIFIABLE_INCIDENT_EVENTS.has(eventType)) return;
  const db = client ?? pool;
  await db.query(
    `INSERT INTO notification_outbox (source_event_id)
     VALUES ($1)
     ON CONFLICT (source_event_id) WHERE source_event_id IS NOT NULL DO NOTHING`,
    [eventId]
  );
}

export async function enqueuePasswordResetNotification(
  requestId: number,
  client?: PoolClient
): Promise<void> {
  const db = client ?? pool;
  await db.query(
    `INSERT INTO notification_outbox (password_reset_request_id)
     VALUES ($1)
     ON CONFLICT (password_reset_request_id)
       WHERE password_reset_request_id IS NOT NULL DO NOTHING`,
    [requestId]
  );
}

export async function claimNotificationOutboxItems(
  limit: number,
  maxAttempts: number
): Promise<NotificationOutboxItem[]> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<NotificationOutboxItem>(
      `WITH candidates AS (
         SELECT id
         FROM notification_outbox
         WHERE status = 'PENDING'
           AND available_at <= NOW()
           AND attempt_count < $2
         ORDER BY available_at ASC, id ASC
         FOR UPDATE SKIP LOCKED
         LIMIT $1
       ), claimed AS (
         UPDATE notification_outbox outbox
         SET status = 'PROCESSING',
             attempt_count = attempt_count + 1,
             locked_at = NOW(),
             updated_at = NOW(),
             last_error_code = NULL
         FROM candidates
         WHERE outbox.id = candidates.id
         RETURNING outbox.*
       )
       SELECT claimed.id::text,
              CASE WHEN claimed.source_event_id IS NOT NULL
                   THEN 'INCIDENT_EVENT' ELSE 'PASSWORD_RESET' END AS source,
              claimed.attempt_count,
              event.incident_id,
              event.event_type,
              event.payload,
              event.actor_user_id,
              user_account.first_name AS reset_first_name,
              user_account.last_name AS reset_last_name,
              reset.badge_number AS reset_badge_number,
              reset.requested_at AS reset_requested_at,
              claimed.delivered_recipients
       FROM claimed
       LEFT JOIN workshop_incident_events event ON event.id = claimed.source_event_id
       LEFT JOIN password_reset_requests reset ON reset.id = claimed.password_reset_request_id
       LEFT JOIN sentinel_users user_account ON user_account.id = reset.user_id
       ORDER BY claimed.id ASC`,
      [limit, maxAttempts]
    );
    return rows;
  });
}

export type NotificationOutboxCompletionStatus =
  'COMPLETED' | 'SKIPPED_DISABLED' | 'SKIPPED_NO_RECIPIENT';

export async function completeNotificationOutboxItem(
  id: string,
  status: NotificationOutboxCompletionStatus = 'COMPLETED'
): Promise<void> {
  await pool.query(
    `UPDATE notification_outbox
     SET status = $2, completed_at = NOW(), locked_at = NULL,
         updated_at = NOW(), last_error_code = NULL
     WHERE id = $1 AND status = 'PROCESSING'`,
    [id, status]
  );
}

export async function retryOrFailNotificationOutboxItem(
  id: string,
  attemptCount: number,
  maxAttempts: number,
  errorCode: string,
  deliveredRecipients?: DeliveredRecipientsByChannel
): Promise<void> {
  const exhausted = attemptCount >= maxAttempts;
  const delaySeconds = Math.min(3600, 30 * 2 ** Math.max(0, attemptCount - 1));
  await pool.query(
    `UPDATE notification_outbox
     SET status = $2::varchar,
         available_at = CASE WHEN $2::varchar = 'PENDING'
                             THEN NOW() + ($3::int * INTERVAL '1 second')
                             ELSE available_at END,
         locked_at = NULL,
         updated_at = NOW(),
         last_error_code = $4::varchar,
         delivered_recipients = COALESCE($5::jsonb, delivered_recipients)
     WHERE id = $1 AND status = 'PROCESSING'`,
    [
      id,
      exhausted ? 'FAILED' : 'PENDING',
      delaySeconds,
      errorCode.slice(0, 80),
      deliveredRecipients ? JSON.stringify(deliveredRecipients) : null,
    ]
  );
}

export async function recoverStaleNotificationOutboxItems(maxAttempts: number): Promise<void> {
  await pool.query(
    `UPDATE notification_outbox
     SET status = CASE WHEN attempt_count >= $1 THEN 'FAILED' ELSE 'PENDING' END,
         available_at = NOW(),
         locked_at = NULL,
         updated_at = NOW(),
         last_error_code = 'WORKER_INTERRUPTED'
     WHERE status = 'PROCESSING'
       AND locked_at < NOW() - INTERVAL '5 minutes'`,
    [maxAttempts]
  );
}
