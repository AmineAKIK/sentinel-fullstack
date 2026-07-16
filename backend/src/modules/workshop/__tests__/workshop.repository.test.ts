jest.mock('../../../db/pool', () => ({
  __esModule: true,
  default: {
    query: jest.fn(),
  },
}));

import pool from '../../../db/pool';
import { getBoardData, updateIncidentData } from '../workshop.repository';

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
      .mockResolvedValueOnce(
        result([
          {
            id: 10,
            line_id: 1,
            line_number: 'L01',
            responsible_comment: 'Sécuriser la zone avant intervention.',
          },
        ])
      )
      .mockResolvedValueOnce(
        result([
          {
            total: 1,
            open_count: 1,
            pending_count: 0,
            open_over_7d: 0,
          },
        ])
      );

    const boardData = await getBoardData();
    const incidentQuery = String(mockedPool.query.mock.calls[1]?.[0]);

    expect(incidentQuery).toContain('responsible_comment');
    expect(boardData.incidents[0]?.responsible_comment).toBe(
      'Sécuriser la zone avant intervention.'
    );
  });
});

describe('updateIncidentData ownership transfer', () => {
  beforeEach(() => {
    mockedPool.query.mockReset();
  });

  it('replaces the technician, timestamp and identity snapshot when an OPEN incident is retaken', async () => {
    const previousTakenAt = new Date('2026-07-01T08:00:00.000Z');
    mockedPool.query.mockResolvedValueOnce(result([{ id: 10 }])).mockResolvedValueOnce(result([]));

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
    expect(String(mockedPool.query.mock.calls[0]?.[0])).toContain('taken_by_user_id');
    expect(String(mockedPool.query.mock.calls[0]?.[0])).toContain('taken_at');
    expect(updateParams[0]).toBe(9);
    expect(updateParams[1]).toBeInstanceOf(Date);
    expect(updateParams[1]).not.toBe(previousTakenAt);
    expect(mockedPool.query.mock.calls[1]?.[1]).toEqual([10, 9]);
    expect(String(mockedPool.query.mock.calls[1]?.[0])).toContain('taken_by_first_name');
  });

  it('does not issue an UPDATE when every requested value is unchanged', async () => {
    const current = {
      id: 10,
      user_id: 1,
      line_id: 2,
      line_number: 'L02',
      machine_id: 'M02',
      machine_brand: 'Panasonic',
      robot_label: 'R1',
      head_number: 3,
      state: 'DEGRADEE' as const,
      comment: null,
      current_product: 'REF-10',
      is_taken: false,
      taken_by_user_id: null,
      taken_at: null,
      is_priority: false,
      status: 'OPEN' as const,
      diagnostic: null,
      intervention_note: null,
      responsible_comment: null,
      edit_request: null,
      cancel_request: false,
      display_order: 0,
      created_at: new Date(),
      updated_at: new Date(),
    };

    await expect(
      updateIncidentData({
        incidentId: 10,
        current,
        updates: { isPriority: false },
        role: 'RESPONSABLE',
        actorUserId: 9,
        selection: { lineNumber: 'L02', machineBrand: 'Panasonic' },
        lineId: 2,
        machineId: 'M02',
        robotLabel: 'R1',
        headNumber: 3,
      })
    ).resolves.toBe(10);
    expect(mockedPool.query.mock.calls).toHaveLength(0);
  });
});
