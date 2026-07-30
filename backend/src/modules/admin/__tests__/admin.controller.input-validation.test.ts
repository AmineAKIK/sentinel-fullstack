import { Request, Response } from 'express';
import { listReferenceAudit } from '../admin.controller';
import * as repo from '../admin.repository';

jest.mock('../admin.repository', () => ({
  getReferenceDashboardData: jest.fn(),
  getReferenceQualityRawData: jest.fn(),
  listReferenceAuditData: jest.fn(),
  listPendingPasswordResetRequestsData: jest.fn(),
  markPasswordResetRequestHandledData: jest.fn(),
}));

jest.mock('../../../db/transaction', () => ({
  withTransaction: jest.fn((fn: (client: null) => Promise<unknown>) => fn(null)),
}));

jest.mock('../../adminAudit/adminAudit.events', () => ({
  createAdminSystemAuditEvent: jest.fn(),
}));

jest.mock('../../../logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

type CapturedResponse = {
  response: Response;
  status: () => number;
  body: () => unknown;
};

function captureResponse(): CapturedResponse {
  let status = 200;
  let body: unknown;
  const response = {
    status: jest.fn((nextStatus: number) => {
      status = nextStatus;
      return response;
    }),
    json: jest.fn((nextBody: unknown) => {
      body = nextBody;
      return response;
    }),
  } as unknown as Response;

  return { response, status: () => status, body: () => body };
}

async function requestAudit(query: Record<string, unknown>): Promise<CapturedResponse> {
  const captured = captureResponse();
  await listReferenceAudit({ query } as unknown as Request, captured.response);
  return captured;
}

function expectSafeValidationError(captured: CapturedResponse): void {
  expect(captured.status()).toBe(400);
  expect(captured.body()).toMatchObject({
    error: {
      code: 'VALIDATION_ERROR',
      message: expect.any(String),
    },
  });
  expect(JSON.stringify(captured.body())).not.toMatch(
    /select|insert|update|delete from|postgres|stack|syntax|sqlstate|\bat (?:async )?[\w$.<>]+ \(/i
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(repo.listReferenceAuditData).mockResolvedValue([]);
});

describe('listReferenceAudit — validation des dates avant PostgreSQL', () => {
  it.each([
    ['texte arbitraire', { start: 'not-a-date' }],
    ['date civile impossible', { start: '2025-02-30T00:00:00.000Z' }],
    ['date sans heure', { end: '2025-01-31' }],
    ['type numérique', { start: 42 }],
    ['type null', { end: null }],
    ['type tableau', { start: ['2025-01-01T00:00:00.000Z'] }],
    [
      'fenêtre inversée',
      {
        start: '2025-02-01T00:00:00.000Z',
        end: '2025-01-01T00:00:00.000Z',
      },
    ],
  ])('rejette %s sans appeler PostgreSQL', async (_label, query) => {
    const captured = await requestAudit(query);

    expectSafeValidationError(captured);
    expect(repo.listReferenceAuditData).not.toHaveBeenCalled();
  });

  it('accepte des bornes ISO valides et transmet leur valeur normalisée', async () => {
    const captured = await requestAudit({
      start: ' 2025-01-01T00:00:00.000Z ',
      end: '2025-01-31T23:59:59.999Z',
      order: 'asc',
    });

    expect(captured.status()).toBe(200);
    expect(captured.body()).toEqual([]);
    expect(repo.listReferenceAuditData).toHaveBeenCalledWith(
      expect.objectContaining({
        start: '2025-01-01T00:00:00.000Z',
        end: '2025-01-31T23:59:59.999Z',
        order: 'ASC',
      })
    );
  });

  it('traite les bornes vides comme des filtres absents', async () => {
    const captured = await requestAudit({ start: ' ', end: '' });

    expect(captured.status()).toBe(200);
    expect(repo.listReferenceAuditData).toHaveBeenCalledWith(
      expect.objectContaining({ start: '', end: '' })
    );
  });
});
