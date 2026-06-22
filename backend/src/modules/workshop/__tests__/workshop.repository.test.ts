jest.mock('../../../db/pool', () => ({
  __esModule: true,
  default: {
    query: jest.fn(),
  },
}));

import pool from '../../../db/pool';
import { getBoardData } from '../workshop.repository';

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
