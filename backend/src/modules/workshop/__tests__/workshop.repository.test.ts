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
  updateIncidentData,
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

describe('updateIncidentData ownership transfer', () => {
  beforeEach(() => {
    mockedPool.query.mockReset();
  });

  it('replaces the technician, timestamp and identity snapshot when an OPEN incident is retaken', async () => {
    const previousTakenAt = new Date('2026-07-01T08:00:00.000Z');
    mockedPool.query
      .mockResolvedValueOnce(result([{ id: 10 }]))
      .mockResolvedValueOnce(result([]));

    await updateIncidentData({
      incidentId: 10,
      current: {
        id: 10,
        user_id: 1,
        line_id: 2,
        line_number: 'L02',
        machine_id: 'M02',
        machine_brand: 'Panasonic',
        robot_label: 'R1',
        head_number: 3,
        state: 'DEGRADEE',
        comment: null,
        current_product: 'REF-10',
        is_taken: true,
        taken_by_user_id: 7,
        taken_at: previousTakenAt,
        is_priority: false,
        status: 'OPEN',
        diagnostic: null,
        intervention_note: null,
        responsible_comment: null,
        edit_request: null,
        cancel_request: false,
        display_order: 0,
        created_at: new Date('2026-07-01T07:00:00.000Z'),
        updated_at: previousTakenAt,
      },
      updates: { isTaken: true },
      role: 'MAINTENANCE',
      actorUserId: 9,
      selection: { lineNumber: 'L02', machineBrand: 'Panasonic' },
      lineId: 2,
      machineId: 'M02',
      robotLabel: 'R1',
      headNumber: 3,
    });

    const updateParams = mockedPool.query.mock.calls[0]?.[1] as unknown[];
    expect(updateParams[15]).toBe(9);
    expect(updateParams[16]).toBeInstanceOf(Date);
    expect(updateParams[16]).not.toBe(previousTakenAt);
    expect(mockedPool.query.mock.calls[1]?.[1]).toEqual([10, 9]);
    expect(String(mockedPool.query.mock.calls[1]?.[0])).toContain('taken_by_first_name');
  });
});
