jest.mock('../../../db/pool', () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));

import pool from '../../../db/pool';
import {
  consultArbitrationCase,
  countActiveArbitrationIncidents,
  createArbitrationCase,
  getOpenArbitrationCase,
  resolveArbitrationCase,
  supersedeOpenArbitrationCases,
} from '../workshop.arbitration.repository';

const mockedPool = jest.mocked(pool);

function result(rows: unknown[], rowCount = rows.length) {
  return { rows, rowCount } as never;
}

beforeEach(() => {
  mockedPool.query.mockReset();
});

it('locks the single open case before a workflow decision', async () => {
  mockedPool.query.mockResolvedValueOnce(result([{ id: 8 }]));

  await getOpenArbitrationCase(14);

  expect(String(mockedPool.query.mock.calls[0]?.[0])).toContain('FOR UPDATE');
  expect(mockedPool.query.mock.calls[0]?.[1]).toEqual([14]);
});

it('creates an immutable case linked to the request event', async () => {
  mockedPool.query.mockResolvedValueOnce(result([{ id: 8 }]));

  const id = await createArbitrationCase({
    incidentId: 14,
    requestEventId: 31,
    requestType: 'EDIT',
    payload: { state: 'INDISPONIBLE' },
    requestedByUserId: 5,
  });

  expect(id).toBe(8);
  expect(mockedPool.query.mock.calls[0]?.[1]).toEqual([
    14,
    31,
    'EDIT',
    JSON.stringify({ state: 'INDISPONIBLE' }),
    null,
    5,
  ]);
});

it('moves only an ACTIVE case to CONSULTED', async () => {
  const consulted = { id: 8, status: 'CONSULTED' };
  mockedPool.query.mockResolvedValueOnce(result([consulted]));

  const value = await consultArbitrationCase(14, 'CANCEL', 7);

  expect(value).toEqual(consulted);
  const sql = String(mockedPool.query.mock.calls[0]?.[0]);
  expect(sql).toContain("status = 'ACTIVE'");
  expect(mockedPool.query.mock.calls[0]?.[1]).toEqual([14, 'CANCEL', 7]);
});

it('resolves only an open case and records the decision actor', async () => {
  mockedPool.query.mockResolvedValueOnce(result([{ id: 8 }]));

  const id = await resolveArbitrationCase(14, 'EDIT', 'REJECTED', 7, 'Hors périmètre');

  expect(id).toBe(8);
  expect(String(mockedPool.query.mock.calls[0]?.[0])).toContain(
    "status IN ('ACTIVE', 'CONSULTED')"
  );
  expect(mockedPool.query.mock.calls[0]?.[1]).toEqual([
    14,
    'EDIT',
    'REJECTED',
    7,
    'Hors périmètre',
  ]);
});

it('supersedes every open case during forced line archival', async () => {
  mockedPool.query.mockResolvedValueOnce(result([], 2));

  const count = await supersedeOpenArbitrationCases([14, 15], 'Ligne archivée');

  expect(count).toBe(2);
  expect(mockedPool.query.mock.calls[0]?.[1]).toEqual([[14, 15], 'Ligne archivée']);
});

it('does not query the database when there is no case to supersede', async () => {
  await expect(supersedeOpenArbitrationCases([], 'Ligne archivée')).resolves.toBe(0);
  expect(mockedPool.query.mock.calls).toHaveLength(0);
});

it('counts only unread ACTIVE cases', async () => {
  mockedPool.query.mockResolvedValueOnce(result([{ count: 3 }]));

  await expect(countActiveArbitrationIncidents()).resolves.toBe(3);
  expect(String(mockedPool.query.mock.calls[0]?.[0])).toContain("WHERE status = 'ACTIVE'");
});
