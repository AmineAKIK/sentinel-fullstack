import logger from '../../logger';
import {
  claimNotificationOutboxItems,
  completeNotificationOutboxItem,
  NotificationOutboxCompletionStatus,
  NotificationOutboxItem,
  recoverStaleNotificationOutboxItems,
  retryOrFailNotificationOutboxItem,
} from './notificationOutbox.repository';
import {
  DeliveryOutcome,
  notifyAdminPasswordResetRequested,
  notifyDeclarantCancelApproved,
  notifyDeclarantCancelRejected,
  notifyDeclarantEditApproved,
  notifyDeclarantEditRejected,
  notifyDeclarantIncidentTaken,
  notifyFollowersIncidentCanceled,
  notifyFollowersIncidentClosed,
  notifyFollowersIncidentSetPending,
  notifyFollowersIncidentTaken,
  notifyMaintenanceIncidentUrgent,
  notifyResponsablesCancelRequested,
  notifyResponsablesEditRequested,
  notifyTechnicianIncidentCanceled,
  notifyTechnicianIncidentInvalidated,
  notifyTechnicianResponsibleComment,
} from './notifications.service';

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_POLL_INTERVAL_MS = 5_000;

function positiveInt(value: string | undefined, fallback: number, max: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

function payloadString(payload: Record<string, unknown> | null, key: string): string {
  const value = payload?.[key];
  return typeof value === 'string' ? value : '';
}

function payloadFields(payload: Record<string, unknown> | null): string {
  const value = payload?.fields;
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string').join(', ') : '';
}

function permanentError(code: string): Error & { code: string; permanent: true } {
  return Object.assign(new Error('Notification outbox item is not processable.'), {
    code,
    permanent: true as const,
  });
}

export async function deliverNotificationOutboxItem(
  item: NotificationOutboxItem
): Promise<DeliveryOutcome[]> {
  if (item.source === 'PASSWORD_RESET') {
    if (
      !item.reset_first_name ||
      !item.reset_last_name ||
      !item.reset_badge_number ||
      !item.reset_requested_at
    ) {
      throw permanentError('PASSWORD_RESET_SOURCE_MISSING');
    }
    return [
      await notifyAdminPasswordResetRequested({
        firstName: item.reset_first_name,
        lastName: item.reset_last_name,
        badgeNumber: item.reset_badge_number,
        requestedAt: item.reset_requested_at,
      }),
    ];
  }

  if (!item.incident_id || !item.event_type || !item.actor_user_id) {
    throw permanentError('INCIDENT_EVENT_SOURCE_MISSING');
  }

  const incidentId = item.incident_id;
  const actorUserId = item.actor_user_id;
  switch (item.event_type) {
    case 'EDIT_REQUESTED':
      return [
        await notifyResponsablesEditRequested(incidentId, actorUserId, payloadFields(item.payload)),
      ];
    case 'CANCEL_REQUESTED':
      return [
        await notifyResponsablesCancelRequested(
          incidentId,
          actorUserId,
          payloadString(item.payload, 'reason')
        ),
      ];
    case 'INCIDENT_TAKEN':
      return [
        await notifyFollowersIncidentTaken(incidentId, actorUserId),
        await notifyDeclarantIncidentTaken(incidentId, actorUserId),
      ];
    case 'INCIDENT_SET_PENDING':
      return [
        await notifyFollowersIncidentSetPending(
          incidentId,
          actorUserId,
          payloadString(item.payload, 'diagnostic')
        ),
      ];
    case 'INCIDENT_CLOSED':
      return [await notifyFollowersIncidentClosed(incidentId, actorUserId)];
    case 'INCIDENT_CANCELED': {
      const outcomes = [
        await notifyFollowersIncidentCanceled(incidentId, actorUserId),
        await notifyTechnicianIncidentCanceled(incidentId, actorUserId),
      ];
      if (payloadString(item.payload, 'mode') === 'request_approved') {
        outcomes.push(await notifyDeclarantCancelApproved(incidentId, actorUserId));
      }
      return outcomes;
    }
    case 'INCIDENT_INVALIDATED':
      return [
        await notifyTechnicianIncidentInvalidated(
          incidentId,
          actorUserId,
          payloadString(item.payload, 'reason')
        ),
      ];
    case 'PRIORITY_CHANGED':
      if (item.payload?.to === true) {
        return [await notifyMaintenanceIncidentUrgent(incidentId, actorUserId)];
      }
      return ['SKIPPED_NO_RECIPIENT'];
    case 'RESPONSIBLE_COMMENT_UPDATED':
      return [
        await notifyTechnicianResponsibleComment(
          incidentId,
          actorUserId,
          payloadString(item.payload, 'to')
        ),
      ];
    case 'EDIT_APPLIED':
      return [await notifyDeclarantEditApproved(incidentId, actorUserId)];
    case 'EDIT_REJECTED':
      return [await notifyDeclarantEditRejected(incidentId, actorUserId)];
    case 'CANCEL_REQUEST_REJECTED':
      return [await notifyDeclarantCancelRejected(incidentId, actorUserId)];
    default:
      throw permanentError('UNSUPPORTED_NOTIFICATION_EVENT');
  }
}

export function summarizeDeliveryOutcomes(
  outcomes: DeliveryOutcome[]
): NotificationOutboxCompletionStatus {
  if (outcomes.some((outcome) => outcome === 'SENT')) return 'COMPLETED';
  if (outcomes.every((outcome) => outcome === 'SKIPPED_DISABLED')) return 'SKIPPED_DISABLED';
  return 'SKIPPED_NO_RECIPIENT';
}

function safeErrorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { code?: unknown; name?: unknown };
    if (typeof candidate.code === 'string' && candidate.code) return candidate.code.slice(0, 80);
    if (typeof candidate.name === 'string' && candidate.name) return candidate.name.slice(0, 80);
  }
  return 'NOTIFICATION_DELIVERY_FAILED';
}

export async function processNotificationOutboxBatch(
  batchSize = DEFAULT_BATCH_SIZE,
  maxAttempts = DEFAULT_MAX_ATTEMPTS
): Promise<number> {
  const items = await claimNotificationOutboxItems(batchSize, maxAttempts);
  for (const item of items) {
    try {
      const outcomes = await deliverNotificationOutboxItem(item);
      await completeNotificationOutboxItem(item.id, summarizeDeliveryOutcomes(outcomes));
    } catch (error) {
      const permanent =
        typeof error === 'object' &&
        error !== null &&
        (error as { permanent?: unknown }).permanent === true;
      await retryOrFailNotificationOutboxItem(
        item.id,
        permanent ? maxAttempts : item.attempt_count,
        maxAttempts,
        safeErrorCode(error)
      );
      logger.error(
        {
          outboxId: item.id,
          attempt: item.attempt_count,
          errorCode: safeErrorCode(error),
          permanent,
        },
        'Notification outbox delivery failed'
      );
    }
  }
  return items.length;
}

export interface NotificationWorker {
  stop: () => Promise<void>;
}

export function startNotificationOutboxWorker(): NotificationWorker {
  const batchSize = positiveInt(process.env.NOTIFICATION_BATCH_SIZE, DEFAULT_BATCH_SIZE, 100);
  const maxAttempts = positiveInt(process.env.NOTIFICATION_MAX_ATTEMPTS, DEFAULT_MAX_ATTEMPTS, 20);
  const pollIntervalMs = positiveInt(
    process.env.NOTIFICATION_POLL_INTERVAL_MS,
    DEFAULT_POLL_INTERVAL_MS,
    60_000
  );
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  let activeRun: Promise<void> | null = null;

  const schedule = (delay: number): void => {
    if (stopped) return;
    timer = setTimeout(() => {
      activeRun = run();
    }, delay);
    timer.unref();
  };

  const run = async (): Promise<void> => {
    try {
      // Récupérée à chaque cycle, pas seulement au démarrage : un worker qui
      // redémarre à mi-poll ne doit jamais être la seule occasion de libérer
      // un lease abandonné par une réplique tombée en cours de traitement.
      await recoverStaleNotificationOutboxItems(maxAttempts);
      const processed = await processNotificationOutboxBatch(batchSize, maxAttempts);
      schedule(processed === batchSize ? 0 : pollIntervalMs);
    } catch (error) {
      logger.error({ err: error }, 'Notification outbox worker iteration failed');
      schedule(pollIntervalMs);
    } finally {
      activeRun = null;
    }
  };

  activeRun = run();

  return {
    stop: async () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (activeRun) await activeRun;
    },
  };
}
