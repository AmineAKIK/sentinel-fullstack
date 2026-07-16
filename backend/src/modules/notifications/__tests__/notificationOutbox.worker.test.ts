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
} from '../notificationOutbox.worker';
import type { NotificationOutboxItem } from '../notificationOutbox.repository';

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
    ...overrides,
  };
}

describe('notification outbox worker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    for (const candidate of Object.values(notifications)) {
      if (jest.isMockFunction(candidate)) candidate.mockResolvedValue(undefined);
    }
  });

  it('livre toutes les audiences prévues puis clôture la tâche', async () => {
    jest.mocked(outboxRepository.claimNotificationOutboxItems).mockResolvedValue([incidentItem()]);

    await expect(processNotificationOutboxBatch(10, 5)).resolves.toBe(1);

    expect(notifications.notifyFollowersIncidentTaken).toHaveBeenCalledWith(42, 7);
    expect(notifications.notifyDeclarantIncidentTaken).toHaveBeenCalledWith(42, 7);
    expect(outboxRepository.completeNotificationOutboxItem).toHaveBeenCalledWith('1');
    expect(outboxRepository.retryOrFailNotificationOutboxItem).not.toHaveBeenCalled();
  });

  it('programme une nouvelle tentative avec un code technique assaini', async () => {
    jest.mocked(outboxRepository.claimNotificationOutboxItems).mockResolvedValue([incidentItem()]);
    jest
      .mocked(notifications.notifyFollowersIncidentTaken)
      .mockRejectedValue(Object.assign(new Error('private SMTP details'), { code: 'ECONNECTION' }));

    await processNotificationOutboxBatch(10, 5);

    expect(outboxRepository.retryOrFailNotificationOutboxItem).toHaveBeenCalledWith(
      '1',
      1,
      5,
      'ECONNECTION'
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

    expect(notifications.notifyAdminPasswordResetRequested).toHaveBeenCalledWith({
      firstName: 'Léa',
      lastName: 'Martin',
      badgeNumber: 'B-12',
      requestedAt,
    });
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
      'INCIDENT_EVENT_SOURCE_MISSING'
    );
  });
});
