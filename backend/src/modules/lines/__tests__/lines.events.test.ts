jest.mock('../../../db/pool', () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));

import pool from '../../../db/pool';
import { createLineAuditEvent } from '../lines.events';

const mockedPool = jest.mocked(pool);

describe('createLineAuditEvent', () => {
  beforeEach(() => mockedPool.query.mockReset());

  it('fige le numéro de ligne au moment de l’événement', async () => {
    mockedPool.query.mockResolvedValueOnce({ rowCount: 1 } as never);

    await expect(
      createLineAuditEvent(4, 2, 'LINE_UPDATED', { lineNumber: '120' })
    ).resolves.toBeUndefined();

    expect(String(mockedPool.query.mock.calls[0]?.[0])).toContain('target_line_number');
    expect(String(mockedPool.query.mock.calls[0]?.[0])).toContain('pl.line_number');
  });

  it('refuse un événement pour une ligne inexistante', async () => {
    mockedPool.query.mockResolvedValueOnce({ rowCount: 0 } as never);

    await expect(createLineAuditEvent(999, 2, 'LINE_UPDATED', null)).rejects.toThrow(
      /ligne 999 introuvable/
    );
  });
});
