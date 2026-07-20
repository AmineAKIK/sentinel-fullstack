import logger from '../../logger';
import {
  claimNotificationOutboxItems,
  completeNotificationOutboxItem,
  DeliveredRecipientsByChannel,
  NotificationOutboxCompletionStatus,
  NotificationOutboxItem,
  recoverStaleNotificationOutboxItems,
  retryOrFailNotificationOutboxItem,
} from './notificationOutbox.repository';
import {
  DeliveryResult,
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

// Exécute chaque canal de notification d'un item, en excluant les
// destinataires déjà confirmés lors d'une tentative précédente (OUT-03).
// Un canal en échec n'interrompt jamais les canaux suivants du même item :
// sinon, un groupe déjà livré avec succès (ex. le déclarant d'INCIDENT_TAKEN)
// ne serait jamais rejoué alors qu'un autre canal du même item vient
// d'échouer pour la première fois (OUT-04). L'échec global n'est signalé
// qu'une fois tous les canaux tentés, avec l'état déjà livré consolidé.
type ChannelError = Error & {
  delivered?: string[];
  deliveredRecipients?: DeliveredRecipientsByChannel;
};

class ChannelRunner {
  readonly delivered: DeliveredRecipientsByChannel;
  readonly outcomes: DeliveryResult['outcome'][] = [];
  private firstFailure: ChannelError | undefined;

  constructor(private readonly baseline: DeliveredRecipientsByChannel) {
    this.delivered = { ...baseline };
  }

  async run(
    channel: string,
    task: (alreadyDelivered: ReadonlySet<string>) => Promise<DeliveryResult>
  ) {
    const alreadyDelivered = new Set(this.baseline[channel] ?? []);
    try {
      const result = await task(alreadyDelivered);
      this.merge(channel, result.delivered);
      this.outcomes.push(result.outcome);
    } catch (error) {
      const channelError: ChannelError = error instanceof Error ? error : new Error(String(error));
      if (Array.isArray(channelError.delivered)) {
        this.merge(channel, channelError.delivered);
      }
      this.firstFailure ??= channelError;
    }
  }

  private merge(channel: string, newlyDelivered: string[]): void {
    if (newlyDelivered.length === 0) return;
    const existing = new Set(this.delivered[channel] ?? []);
    for (const recipient of newlyDelivered) existing.add(recipient);
    this.delivered[channel] = Array.from(existing);
  }

  throwIfFailed(): void {
    if (!this.firstFailure) return;
    // Porté sur l'erreur : deliverNotificationOutboxItem se termine par un
    // throw, donc processNotificationOutboxBatch n'a accès à l'état consolidé
    // que via cette propriété pour persister ce qui a déjà été livré (OUT-04).
    this.firstFailure.deliveredRecipients = this.delivered;
    throw this.firstFailure;
  }
}

export async function deliverNotificationOutboxItem(
  item: NotificationOutboxItem
): Promise<ChannelRunner> {
  const runner = new ChannelRunner(item.delivered_recipients ?? {});

  if (item.source === 'PASSWORD_RESET') {
    if (
      !item.reset_first_name ||
      !item.reset_last_name ||
      !item.reset_badge_number ||
      !item.reset_requested_at
    ) {
      throw permanentError('PASSWORD_RESET_SOURCE_MISSING');
    }
    await runner.run('admin_password_reset', (alreadyDelivered) =>
      notifyAdminPasswordResetRequested(
        {
          firstName: item.reset_first_name!,
          lastName: item.reset_last_name!,
          badgeNumber: item.reset_badge_number!,
          requestedAt: item.reset_requested_at!,
        },
        alreadyDelivered
      )
    );
    runner.throwIfFailed();
    return runner;
  }

  if (!item.incident_id || !item.event_type || !item.actor_user_id) {
    throw permanentError('INCIDENT_EVENT_SOURCE_MISSING');
  }

  const incidentId = item.incident_id;
  const actorUserId = item.actor_user_id;
  switch (item.event_type) {
    case 'EDIT_REQUESTED':
      await runner.run('responsables_edit_requested', (alreadyDelivered) =>
        notifyResponsablesEditRequested(
          incidentId,
          actorUserId,
          payloadFields(item.payload),
          alreadyDelivered
        )
      );
      break;
    case 'CANCEL_REQUESTED':
      await runner.run('responsables_cancel_requested', (alreadyDelivered) =>
        notifyResponsablesCancelRequested(
          incidentId,
          actorUserId,
          payloadString(item.payload, 'reason'),
          alreadyDelivered
        )
      );
      break;
    case 'INCIDENT_TAKEN':
      await runner.run('followers_incident_taken', (alreadyDelivered) =>
        notifyFollowersIncidentTaken(incidentId, actorUserId, alreadyDelivered)
      );
      await runner.run('declarant_incident_taken', (alreadyDelivered) =>
        notifyDeclarantIncidentTaken(incidentId, actorUserId, alreadyDelivered)
      );
      break;
    case 'INCIDENT_SET_PENDING':
      await runner.run('followers_incident_set_pending', (alreadyDelivered) =>
        notifyFollowersIncidentSetPending(
          incidentId,
          actorUserId,
          payloadString(item.payload, 'diagnostic'),
          alreadyDelivered
        )
      );
      break;
    case 'INCIDENT_CLOSED':
      await runner.run('followers_incident_closed', (alreadyDelivered) =>
        notifyFollowersIncidentClosed(incidentId, actorUserId, alreadyDelivered)
      );
      break;
    case 'INCIDENT_CANCELED':
      await runner.run('followers_incident_canceled', (alreadyDelivered) =>
        notifyFollowersIncidentCanceled(incidentId, actorUserId, alreadyDelivered)
      );
      await runner.run('technician_incident_canceled', (alreadyDelivered) =>
        notifyTechnicianIncidentCanceled(incidentId, actorUserId, alreadyDelivered)
      );
      if (payloadString(item.payload, 'mode') === 'request_approved') {
        await runner.run('declarant_cancel_approved', (alreadyDelivered) =>
          notifyDeclarantCancelApproved(incidentId, actorUserId, alreadyDelivered)
        );
      }
      break;
    case 'INCIDENT_INVALIDATED':
      await runner.run('technician_incident_invalidated', (alreadyDelivered) =>
        notifyTechnicianIncidentInvalidated(
          incidentId,
          actorUserId,
          payloadString(item.payload, 'reason'),
          alreadyDelivered
        )
      );
      break;
    case 'PRIORITY_CHANGED':
      if (item.payload?.to === true) {
        await runner.run('maintenance_incident_urgent', (alreadyDelivered) =>
          notifyMaintenanceIncidentUrgent(incidentId, actorUserId, alreadyDelivered)
        );
      } else {
        runner.outcomes.push('SKIPPED_NO_RECIPIENT');
      }
      break;
    case 'RESPONSIBLE_COMMENT_UPDATED':
      await runner.run('technician_responsible_comment', (alreadyDelivered) =>
        notifyTechnicianResponsibleComment(
          incidentId,
          actorUserId,
          payloadString(item.payload, 'to'),
          alreadyDelivered
        )
      );
      break;
    case 'EDIT_APPLIED':
      await runner.run('declarant_edit_approved', (alreadyDelivered) =>
        notifyDeclarantEditApproved(incidentId, actorUserId, alreadyDelivered)
      );
      break;
    case 'EDIT_REJECTED':
      await runner.run('declarant_edit_rejected', (alreadyDelivered) =>
        notifyDeclarantEditRejected(incidentId, actorUserId, alreadyDelivered)
      );
      break;
    case 'CANCEL_REQUEST_REJECTED':
      await runner.run('declarant_cancel_rejected', (alreadyDelivered) =>
        notifyDeclarantCancelRejected(incidentId, actorUserId, alreadyDelivered)
      );
      break;
    default:
      throw permanentError('UNSUPPORTED_NOTIFICATION_EVENT');
  }

  runner.throwIfFailed();
  return runner;
}

export function summarizeDeliveryOutcomes(
  outcomes: DeliveryResult['outcome'][]
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
      const runner = await deliverNotificationOutboxItem(item);
      await completeNotificationOutboxItem(item.id, summarizeDeliveryOutcomes(runner.outcomes));
    } catch (error) {
      const permanent =
        typeof error === 'object' &&
        error !== null &&
        (error as { permanent?: unknown }).permanent === true;
      const deliveredRecipients = (error as { deliveredRecipients?: DeliveredRecipientsByChannel })
        .deliveredRecipients;
      await retryOrFailNotificationOutboxItem(
        item.id,
        permanent ? maxAttempts : item.attempt_count,
        maxAttempts,
        safeErrorCode(error),
        deliveredRecipients
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
