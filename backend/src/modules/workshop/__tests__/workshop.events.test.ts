jest.mock('../../../db/pool', () => ({
  __esModule: true,
  default: {
    query: jest.fn(),
  },
}));

jest.mock('../../../logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

jest.mock('../../notifications/notificationOutbox.repository', () => ({
  enqueueIncidentNotification: jest.fn(),
}));

import pool from '../../../db/pool';
import { logIncidentEvent } from '../workshop.events';
import { enqueueIncidentNotification } from '../../notifications/notificationOutbox.repository';

const mockedPool = jest.mocked(pool);

describe('logIncidentEvent', () => {
  beforeEach(() => {
    mockedPool.query.mockReset();
  });

  it("insère l'événement quand l'acteur existe", async () => {
    mockedPool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 42 }] } as never);

    await expect(logIncidentEvent(1, 7, 'INCIDENT_CREATED', { foo: 'bar' })).resolves.toBe(42);

    expect(mockedPool.query.mock.calls.length).toBe(1);
    expect(enqueueIncidentNotification).toHaveBeenCalledWith(
      42,
      'INCIDENT_CREATED',
      'WORKSHOP_USER',
      undefined
    );
  });

  it("enregistre la notification durable dans la transaction de l'événement", async () => {
    mockedPool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 45 }] } as never);

    await logIncidentEvent(1, 7, 'INCIDENT_TAKEN', { from: false, to: true });

    expect(enqueueIncidentNotification).toHaveBeenCalledWith(
      45,
      'INCIDENT_TAKEN',
      'WORKSHOP_USER',
      undefined
    );
  });

  it("lève une erreur si l'acteur ne correspond à aucun utilisateur (0 ligne insérée)", async () => {
    mockedPool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] } as never);

    await expect(logIncidentEvent(1, 999, 'INCIDENT_CREATED')).rejects.toThrow(
      /aucun événement inséré/
    );
  });

  it('propage une erreur SQL réelle', async () => {
    (mockedPool.query as jest.Mock).mockRejectedValueOnce(new Error('connection lost'));

    await expect(logIncidentEvent(1, 7, 'INCIDENT_CREATED')).rejects.toThrow('connection lost');
  });

  it("journalise un administrateur avec un acteur d'audit explicite", async () => {
    mockedPool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 43 }] } as never);

    await expect(
      logIncidentEvent(1, { kind: 'ADMIN', adminId: 3 }, 'INCIDENT_CANCELED', {
        reason: 'line_archived',
      })
    ).resolves.toBe(43);

    expect(String(mockedPool.query.mock.calls[0]?.[0])).toContain("'ADMIN'");
  });

  it('journalise un acteur système sans usurper un utilisateur', async () => {
    mockedPool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 44 }] } as never);

    await expect(
      logIncidentEvent(1, { kind: 'SYSTEM', displayName: 'Migration Sentinel' }, 'STATUS_CHANGED')
    ).resolves.toBe(44);

    expect(String(mockedPool.query.mock.calls[0]?.[0])).toContain("'SYSTEM'");
  });
});
