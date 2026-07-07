jest.mock('../../../db/pool', () => ({
  __esModule: true,
  default: {
    query: jest.fn(),
  },
}));

import pool from '../../../db/pool';
import {
  consultArbitrationRequest,
  countUnconsultedArbitrationIncidents,
  getBoardData,
} from '../workshop.repository';

const mockedPool = jest.mocked(pool);

function result(rows: unknown[]) {
  return { rows } as never;
}

describe('getBoardData', () => {
  beforeEach(() => {
    mockedPool.query.mockReset();
  });

  it('expose la consigne responsable dans le contrat incident du board', async () => {
    mockedPool.query
      .mockResolvedValueOnce(result([{ id: 1, line_number: 'L01' }]))
      .mockResolvedValueOnce(result([{
        id: 10,
        line_id: 1,
        line_number: 'L01',
        responsible_comment: 'Sécuriser la zone avant intervention.',
      }]))
      .mockResolvedValueOnce(result([{
        total: 1,
        open_count: 1,
        pending_count: 0,
        open_over_7d: 0,
      }]));

    const boardData = await getBoardData();
    const incidentQuery = String(mockedPool.query.mock.calls[1]?.[0]);

    expect(incidentQuery).toContain('responsible_comment');
    expect(boardData.incidents[0]?.responsible_comment).toBe('Sécuriser la zone avant intervention.');
  });
});

describe('arbitration consultation tracking', () => {
  beforeEach(() => {
    mockedPool.query.mockReset();
  });

  it("compte les incidents d'arbitrage avec au moins une demande active non consultée", async () => {
    mockedPool.query.mockResolvedValueOnce(result([{ unread_count: 3 }]));

    const count = await countUnconsultedArbitrationIncidents();
    const sql = String(mockedPool.query.mock.calls[0]?.[0]);

    expect(count).toBe(3);
    expect(sql).toContain("we.event_type = 'EDIT_REQUESTED'");
    expect(sql).toContain("we.event_type = 'CANCEL_REQUESTED'");
    expect(sql).toContain('workshop_arbitration_consultations');
  });

  it('insère les consultations actives de manière idempotente', async () => {
    mockedPool.query.mockResolvedValueOnce({ rows: [], rowCount: 2 } as never);

    const consulted = await consultArbitrationRequest(12, 7, 'ALL');
    const sql = String(mockedPool.query.mock.calls[0]?.[0]);

    expect(consulted).toBe(2);
    expect(sql).toContain('INSERT INTO workshop_arbitration_consultations');
    expect(sql).toContain('ON CONFLICT (request_event_id) DO NOTHING');
    expect(mockedPool.query.mock.calls[0]?.[1]).toEqual([12, 7, 'ALL']);
  });
});
