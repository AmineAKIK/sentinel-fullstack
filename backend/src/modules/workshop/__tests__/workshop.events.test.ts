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

import pool from '../../../db/pool';
import { logIncidentEvent } from '../workshop.events';

const mockedPool = jest.mocked(pool);

describe('logIncidentEvent', () => {
  beforeEach(() => {
    mockedPool.query.mockReset();
  });

  it("insère l'événement quand l'acteur existe", async () => {
    mockedPool.query.mockResolvedValueOnce({ rowCount: 1 } as never);

    await expect(
      logIncidentEvent(1, 7, 'INCIDENT_CREATED', { foo: 'bar' })
    ).resolves.toBeUndefined();

    expect(mockedPool.query.mock.calls.length).toBe(1);
  });

  it("lève une erreur si l'acteur ne correspond à aucun utilisateur (0 ligne insérée)", async () => {
    mockedPool.query.mockResolvedValueOnce({ rowCount: 0 } as never);

    await expect(logIncidentEvent(1, 999, 'INCIDENT_CREATED')).rejects.toThrow(
      /aucun événement inséré/
    );
  });

  it('propage une erreur SQL réelle', async () => {
    (mockedPool.query as jest.Mock).mockRejectedValueOnce(new Error('connection lost'));

    await expect(logIncidentEvent(1, 7, 'INCIDENT_CREATED')).rejects.toThrow('connection lost');
  });
});
