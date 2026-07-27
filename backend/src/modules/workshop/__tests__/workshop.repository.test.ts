jest.mock('../../../db/pool', () => ({
  __esModule: true,
  default: {
    query: jest.fn(),
  },
}));

import pool from '../../../db/pool';
import {
  getBoardData,
  getIncidentById,
  getIncidentLineLockContext,
  lockActiveWorkshopLines,
  lockWorkshopAssignee,
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

  it('expose uniquement l’EXISTENCE d’un arbitrage au board, jamais les identités ni les motifs', async () => {
    mockedPool.query
      .mockResolvedValueOnce(result([{ id: 1, line_number: 'L01' }]))
      .mockResolvedValueOnce(
        result([{ id: 10, line_id: 1, has_edit_arbitration: false, has_cancel_arbitration: true }])
      )
      .mockResolvedValueOnce(
        result([{ total: 1, open_count: 1, pending_count: 0, open_over_7d: 0 }])
      );

    const boardData = await getBoardData();
    const incidentQuery = String(mockedPool.query.mock.calls[1]?.[0]);

    // La projection dérive un simple booléen par type de demande…
    expect(incidentQuery).toContain('(edit_request IS NOT NULL) AS has_edit_arbitration');
    expect(incidentQuery).toContain('(cancel_request = TRUE) AS has_cancel_arbitration');
    // …et n'expose ni le contenu de la demande, ni le motif d'annulation, ni un
    // quelconque identifiant de demandeur ou d'arbitre.
    expect(incidentQuery).not.toContain('cancel_request_reason');
    expect(incidentQuery).not.toContain('edit_request,');
    expect(incidentQuery).not.toMatch(/\bdecided_by\b/);
    expect(boardData.incidents[0]?.has_cancel_arbitration).toBe(true);
    expect(boardData.incidents[0]?.has_edit_arbitration).toBe(false);
  });
});

describe('incident line lock protocol', () => {
  beforeEach(() => {
    mockedPool.query.mockReset();
  });

  it('reads the incident lock context without acquiring the incident row lock', async () => {
    mockedPool.query.mockResolvedValueOnce(
      result([
        {
          line_id: 4,
          edit_request: { lineId: 8 },
          row_version: '42',
        },
      ])
    );

    const context = await getIncidentLineLockContext(12);
    const sql = String(mockedPool.query.mock.calls[0]?.[0]);

    expect(context).toMatchObject({ line_id: 4, edit_request: { lineId: 8 } });
    expect(sql).toContain('xmin::text AS row_version');
    expect(sql).not.toContain('FOR UPDATE');
    expect(mockedPool.query.mock.calls[0]).toEqual([expect.any(String), [12]]);
  });

  it('returns the same MVCC version while locking the incident row', async () => {
    mockedPool.query.mockResolvedValueOnce(result([{ id: 12, row_version: '42' }]));

    const incident = await getIncidentById(12);
    const sql = String(mockedPool.query.mock.calls[0]?.[0]);

    expect(incident).toMatchObject({ id: 12, row_version: '42' });
    expect(sql).toContain('xmin::text AS row_version');
    expect(sql).toContain('FOR UPDATE');
  });

  it('deduplicates and locks lines one by one in ascending id order on the supplied client', async () => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce(result([{ id: 2, line_number: 'L02', machines: [] }]))
        .mockResolvedValueOnce(result([{ id: 7, line_number: 'L07', machines: [] }])),
    };

    const lines = await lockActiveWorkshopLines([7, 2, 7], client as never);

    expect(client.query).toHaveBeenCalledTimes(2);
    expect(client.query.mock.calls.map((call) => call[1])).toEqual([[2], [7]]);
    expect(client.query.mock.calls.every((call) => String(call[0]).includes('FOR UPDATE'))).toBe(
      true
    );
    expect(lines.map((line) => line.id)).toEqual([2, 7]);
    expect(mockedPool.query.mock.calls).toHaveLength(0);
  });

  it('locks the complete assignee lifecycle row on the supplied client', async () => {
    const assignee = {
      id: 9,
      role: 'MAINTENANCE',
      is_active: true,
      is_deleted: false,
    };
    const client = { query: jest.fn().mockResolvedValueOnce(result([assignee])) };

    await expect(lockWorkshopAssignee(9, client as never)).resolves.toEqual(assignee);

    const [sql, params] = client.query.mock.calls[0];
    expect(String(sql)).toContain('role, is_active, is_deleted');
    expect(String(sql)).toContain('FOR UPDATE');
    expect(params).toEqual([9]);
    expect(mockedPool.query.mock.calls).toHaveLength(0);
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
        waiting_reason: null,
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
      waiting_reason: null,
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
