jest.mock('../notificationOutbox.repository', () => ({
  claimNotificationOutboxItems: jest.fn(),
  completeNotificationOutboxItem: jest.fn(),
  recoverStaleNotificationOutboxItems: jest.fn(),
  retryOrFailNotificationOutboxItem: jest.fn(),
}));

jest.mock('../notifications.service', () => ({
  notifyAdminPasswordResetRequested: jest.fn(),
  notifyDeclarantCancelApproved: jest.fn(),
  notifyDeclarantCancelRejected: jest.fn(),
  notifyDeclarantEditApproved: jest.fn(),
  notifyDeclarantEditRejected: jest.fn(),
  notifyDeclarantIncidentTaken: jest.fn(),
  notifyFollowersIncidentCanceled: jest.fn(),
  notifyFollowersIncidentClosed: jest.fn(),
  notifyFollowersIncidentSetPending: jest.fn(),
  notifyFollowersIncidentTaken: jest.fn(),
  notifyMaintenanceIncidentUrgent: jest.fn(),
  notifyResponsablesCancelRequested: jest.fn(),
  notifyResponsablesEditRequested: jest.fn(),
  notifyTechnicianIncidentCanceled: jest.fn(),
  notifyTechnicianIncidentInvalidated: jest.fn(),
  notifyTechnicianResponsibleComment: jest.fn(),
}));

jest.mock('../../../logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

import * as outboxRepository from '../notificationOutbox.repository';
import * as notifications from '../notifications.service';
import {
  deliverNotificationOutboxItem,
  processNotificationOutboxBatch,
  startNotificationOutboxWorker,
  summarizeDeliveryOutcomes,
} from '../notificationOutbox.worker';
import type { DeliveryResult } from '../notifications.service';
import type { NotificationOutboxItem } from '../notificationOutbox.repository';

function sent(delivered: string[] = ['x@example.test']): DeliveryResult {
  return { outcome: 'SENT', delivered };
}

function incidentItem(overrides: Partial<NotificationOutboxItem> = {}): NotificationOutboxItem {
  return {
    id: '1',
    source: 'INCIDENT_EVENT',
    attempt_count: 1,
    incident_id: 42,
    event_type: 'INCIDENT_TAKEN',
    payload: {},
    actor_user_id: 7,
    reset_first_name: null,
    reset_last_name: null,
    reset_badge_number: null,
    reset_requested_at: null,
    delivered_recipients: {},
    ...overrides,
  };
}

describe('notification outbox worker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    for (const candidate of Object.values(notifications)) {
      if (jest.isMockFunction(candidate)) candidate.mockResolvedValue(sent());
    }
  });

  it('livre toutes les audiences prévues puis clôture la tâche en COMPLETED', async () => {
    jest.mocked(outboxRepository.claimNotificationOutboxItems).mockResolvedValue([incidentItem()]);

    await expect(processNotificationOutboxBatch(10, 5)).resolves.toBe(1);

    expect(notifications.notifyFollowersIncidentTaken).toHaveBeenCalledWith(42, 7, new Set());
    expect(notifications.notifyDeclarantIncidentTaken).toHaveBeenCalledWith(42, 7, new Set());
    expect(outboxRepository.completeNotificationOutboxItem).toHaveBeenCalledWith('1', 'COMPLETED');
    expect(outboxRepository.retryOrFailNotificationOutboxItem).not.toHaveBeenCalled();
  });

  it('programme une nouvelle tentative avec un code technique assaini, sans perdre les canaux déjà livrés (OUT-04)', async () => {
    jest.mocked(outboxRepository.claimNotificationOutboxItems).mockResolvedValue([incidentItem()]);
    jest
      .mocked(notifications.notifyFollowersIncidentTaken)
      .mockRejectedValue(Object.assign(new Error('private SMTP details'), { code: 'ECONNECTION' }));
    // notifyDeclarantIncidentTaken reste sur le succès par défaut du beforeEach :
    // ce canal indépendant doit être tenté et son succès conservé malgré
    // l'échec du canal followers.

    await processNotificationOutboxBatch(10, 5);

    expect(notifications.notifyDeclarantIncidentTaken).toHaveBeenCalled();
    expect(outboxRepository.retryOrFailNotificationOutboxItem).toHaveBeenCalledWith(
      '1',
      1,
      5,
      'ECONNECTION',
      expect.objectContaining({ declarant_incident_taken: expect.any(Array) })
    );
    expect(outboxRepository.completeNotificationOutboxItem).not.toHaveBeenCalled();
  });

  it('route une demande de réinitialisation sans recopier son contenu dans l’outbox', async () => {
    const requestedAt = new Date('2026-07-16T08:00:00.000Z');
    await deliverNotificationOutboxItem(
      incidentItem({
        source: 'PASSWORD_RESET',
        incident_id: null,
        event_type: null,
        actor_user_id: null,
        reset_first_name: 'Léa',
        reset_last_name: 'Martin',
        reset_badge_number: 'B-12',
        reset_requested_at: requestedAt,
      })
    );

    expect(notifications.notifyAdminPasswordResetRequested).toHaveBeenCalledWith(
      {
        firstName: 'Léa',
        lastName: 'Martin',
        badgeNumber: 'B-12',
        requestedAt,
      },
      new Set()
    );
  });

  it('classe immédiatement une source incohérente en échec permanent', async () => {
    jest
      .mocked(outboxRepository.claimNotificationOutboxItems)
      .mockResolvedValue([incidentItem({ actor_user_id: null })]);

    await processNotificationOutboxBatch(10, 5);

    expect(outboxRepository.retryOrFailNotificationOutboxItem).toHaveBeenCalledWith(
      '1',
      5,
      5,
      'INCIDENT_EVENT_SOURCE_MISSING',
      undefined
    );
  });

  it('récupère les leases périmés à chaque cycle, pas seulement au démarrage (OUT-01)', async () => {
    jest.useFakeTimers();
    try {
      const batchSize = 10;
      // Un batch plein déclenche un second cycle immédiat (schedule(0)) : le
      // worker ne doit pas se contenter de la récupération faite au démarrage.
      jest
        .mocked(outboxRepository.claimNotificationOutboxItems)
        .mockResolvedValueOnce(Array.from({ length: batchSize }, () => incidentItem()))
        .mockResolvedValue([]);
      jest
        .mocked(outboxRepository.recoverStaleNotificationOutboxItems)
        .mockResolvedValue(undefined);
      process.env.NOTIFICATION_BATCH_SIZE = String(batchSize);

      const worker = startNotificationOutboxWorker();
      // Premier cycle (démarrage) : laisse les microtasks de la promesse initiale se résoudre.
      await jest.advanceTimersByTimeAsync(0);
      // Le premier cycle a traité un batch plein : schedule(0) arme un second
      // cycle immédiat, qu'il faut avancer explicitement pour l'observer.
      await jest.advanceTimersByTimeAsync(0);

      expect(
        jest.mocked(outboxRepository.recoverStaleNotificationOutboxItems).mock.calls.length
      ).toBeGreaterThanOrEqual(2);

      await worker.stop();
      delete process.env.NOTIFICATION_BATCH_SIZE;
    } finally {
      jest.useRealTimers();
    }
  });

  describe('summarizeDeliveryOutcomes (OUT-02, OUT-05)', () => {
    it('retourne COMPLETED dès qu’au moins un envoi réel a eu lieu', () => {
      expect(summarizeDeliveryOutcomes(['SENT'])).toBe('COMPLETED');
      expect(summarizeDeliveryOutcomes(['SKIPPED_NO_RECIPIENT', 'SENT'])).toBe('COMPLETED');
      expect(summarizeDeliveryOutcomes(['SKIPPED_DISABLED', 'SENT'])).toBe('COMPLETED');
    });

    it('retourne SKIPPED_DISABLED seulement si toutes les audiences sont désactivées', () => {
      expect(summarizeDeliveryOutcomes(['SKIPPED_DISABLED'])).toBe('SKIPPED_DISABLED');
      expect(summarizeDeliveryOutcomes(['SKIPPED_DISABLED', 'SKIPPED_DISABLED'])).toBe(
        'SKIPPED_DISABLED'
      );
    });

    it('retourne SKIPPED_NO_RECIPIENT si aucune audience désactivée n’explique l’absence d’envoi', () => {
      expect(summarizeDeliveryOutcomes(['SKIPPED_NO_RECIPIENT'])).toBe('SKIPPED_NO_RECIPIENT');
      expect(summarizeDeliveryOutcomes(['SKIPPED_DISABLED', 'SKIPPED_NO_RECIPIENT'])).toBe(
        'SKIPPED_NO_RECIPIENT'
      );
    });
  });

  it('ne notifie personne pour un changement de priorité qui redescend (pas de destinataire prévu)', async () => {
    const runner = await deliverNotificationOutboxItem(
      incidentItem({ event_type: 'PRIORITY_CHANGED', payload: { to: false } })
    );

    expect(notifications.notifyMaintenanceIncidentUrgent).not.toHaveBeenCalled();
    expect(runner.outcomes).toEqual(['SKIPPED_NO_RECIPIENT']);
  });

  it('marque SKIPPED_DISABLED quand la seule audience a désactivé ses notifications (OUT-02)', async () => {
    jest.mocked(outboxRepository.claimNotificationOutboxItems).mockResolvedValue([incidentItem()]);
    jest
      .mocked(notifications.notifyFollowersIncidentTaken)
      .mockResolvedValue({ outcome: 'SKIPPED_DISABLED', delivered: [] });
    jest
      .mocked(notifications.notifyDeclarantIncidentTaken)
      .mockResolvedValue({ outcome: 'SKIPPED_DISABLED', delivered: [] });

    await processNotificationOutboxBatch(10, 5);

    expect(outboxRepository.completeNotificationOutboxItem).toHaveBeenCalledWith(
      '1',
      'SKIPPED_DISABLED'
    );
  });

  describe('reprises isolées par destinataire (lot 5B)', () => {
    it('exclut les destinataires déjà confirmés lors d’une tentative précédente du même canal (OUT-03)', async () => {
      const item = incidentItem({
        event_type: 'INCIDENT_CLOSED',
        delivered_recipients: { followers_incident_closed: ['already@example.test'] },
      });
      jest.mocked(outboxRepository.claimNotificationOutboxItems).mockResolvedValue([item]);

      await processNotificationOutboxBatch(10, 5);

      expect(notifications.notifyFollowersIncidentClosed).toHaveBeenCalledWith(
        42,
        7,
        new Set(['already@example.test'])
      );
    });

    it('fusionne les nouveaux succès avec les destinataires déjà confirmés sans en perdre aucun (OUT-03)', async () => {
      const item = incidentItem({
        event_type: 'INCIDENT_CLOSED',
        delivered_recipients: { followers_incident_closed: ['already@example.test'] },
      });
      jest.mocked(outboxRepository.claimNotificationOutboxItems).mockResolvedValue([item]);
      jest
        .mocked(notifications.notifyFollowersIncidentClosed)
        .mockResolvedValue(sent(['new@example.test']));

      const runner = await deliverNotificationOutboxItem(item);

      expect(runner.delivered.followers_incident_closed).toEqual(
        expect.arrayContaining(['already@example.test', 'new@example.test'])
      );
    });

    it('un canal déjà servi exclut ses destinataires confirmés même si un autre canal du même item échoue (OUT-04)', async () => {
      // INCIDENT_TAKEN a deux canaux indépendants : followers et déclarant.
      // Le déclarant a déjà réussi une adresse lors d'une tentative
      // précédente ; l'échec du canal followers ne doit ni l'empêcher d'être
      // tenté à nouveau (idempotent grâce à l'exclusion), ni lui faire perdre
      // le destinataire déjà confirmé.
      const item = incidentItem({
        event_type: 'INCIDENT_TAKEN',
        delivered_recipients: { declarant_incident_taken: ['declarant@example.test'] },
      });
      jest.mocked(outboxRepository.claimNotificationOutboxItems).mockResolvedValue([item]);
      jest
        .mocked(notifications.notifyFollowersIncidentTaken)
        .mockRejectedValue(
          Object.assign(new Error('smtp down'), { code: 'ECONNECTION', delivered: [] })
        );
      jest.mocked(notifications.notifyDeclarantIncidentTaken).mockResolvedValue(sent([]));

      await processNotificationOutboxBatch(10, 5);

      expect(notifications.notifyDeclarantIncidentTaken).toHaveBeenCalledWith(
        42,
        7,
        new Set(['declarant@example.test'])
      );
      expect(outboxRepository.retryOrFailNotificationOutboxItem).toHaveBeenCalledWith(
        '1',
        1,
        5,
        'ECONNECTION',
        expect.objectContaining({ declarant_incident_taken: ['declarant@example.test'] })
      );
    });

    it('persiste les destinataires confirmés par un canal avant qu’un canal suivant échoue (OUT-04)', async () => {
      const item = incidentItem({ event_type: 'INCIDENT_TAKEN' });
      jest.mocked(outboxRepository.claimNotificationOutboxItems).mockResolvedValue([item]);
      jest
        .mocked(notifications.notifyFollowersIncidentTaken)
        .mockResolvedValue(sent(['followers@example.test']));
      jest
        .mocked(notifications.notifyDeclarantIncidentTaken)
        .mockRejectedValue(
          Object.assign(new Error('smtp down'), { code: 'ECONNECTION', delivered: [] })
        );

      await processNotificationOutboxBatch(10, 5);

      expect(outboxRepository.retryOrFailNotificationOutboxItem).toHaveBeenCalledWith(
        '1',
        1,
        5,
        'ECONNECTION',
        expect.objectContaining({ followers_incident_taken: ['followers@example.test'] })
      );
    });

    it('persiste les destinataires déjà livrés par sendMail même quand un envoi partiel échoue (OUT-03)', async () => {
      const item = incidentItem({ event_type: 'INCIDENT_CLOSED' });
      jest.mocked(outboxRepository.claimNotificationOutboxItems).mockResolvedValue([item]);
      jest.mocked(notifications.notifyFollowersIncidentClosed).mockRejectedValue(
        Object.assign(new Error('one recipient failed'), {
          code: 'SMTP_DELIVERY_FAILED',
          delivered: ['succeeded@example.test'],
        })
      );

      await processNotificationOutboxBatch(10, 5);

      expect(outboxRepository.retryOrFailNotificationOutboxItem).toHaveBeenCalledWith(
        '1',
        1,
        5,
        'SMTP_DELIVERY_FAILED',
        expect.objectContaining({
          followers_incident_closed: ['succeeded@example.test'],
        })
      );
    });
  });
});
