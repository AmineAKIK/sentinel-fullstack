import { Request, Response } from 'express';
import { checkLineConflicts } from '../lines.controller';
import * as repo from '../lines.repository';

jest.mock('../lines.repository', () => ({
  findMachineConflicts: jest.fn(),
  lineNumberExists: jest.fn(),
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

async function requestConflicts(body: unknown): Promise<CapturedResponse> {
  const captured = captureResponse();
  await checkLineConflicts({ body } as Request, captured.response);
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
    /select|insert|update|delete from|postgres|stack|typeerror|\.trim|\bat (?:async )?[\w$.<>]+ \(/i
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(repo.findMachineConflicts).mockImplementation(async (machineIds) => {
    machineIds.map((machineId) => machineId.trim().toLowerCase());
    return [];
  });
  jest.mocked(repo.lineNumberExists).mockResolvedValue(false);
});

describe('checkLineConflicts — validation machineIds avant repository', () => {
  it.each([
    ['tableau mixte', ['M-01', 42]],
    ['élément null', ['M-01', null]],
    ['élément vide', ['M-01', '']],
    ['élément objet', ['M-01', { id: 'M-02' }]],
    ['valeur null', null],
    ['chaîne au lieu du tableau', 'M-01'],
    ['nombre au lieu du tableau', 42],
    ['objet au lieu du tableau', { machine: 'M-01' }],
  ])('rejette %s sans appeler le repository', async (_label, machineIds) => {
    const captured = await requestConflicts({ lineNumber: '001', machineIds });

    expectSafeValidationError(captured);
    expect(repo.findMachineConflicts).not.toHaveBeenCalled();
    expect(repo.lineNumberExists).not.toHaveBeenCalled();
  });

  it('accepte explicitement un tableau vide pour vérifier seulement la ligne', async () => {
    const captured = await requestConflicts({ lineNumber: '001', machineIds: [] });

    expect(captured.status()).toBe(200);
    expect(captured.body()).toEqual({ lineExists: false, machineConflicts: [] });
    expect(repo.findMachineConflicts).toHaveBeenCalledWith([], undefined);
    expect(repo.lineNumberExists).toHaveBeenCalledWith('001', undefined);
  });

  it('normalise les identifiants machine valides avant le repository', async () => {
    const captured = await requestConflicts({
      lineNumber: '001',
      machineIds: [' M-01 ', 'M_02'],
      lineId: '7',
    });

    expect(captured.status()).toBe(200);
    expect(repo.findMachineConflicts).toHaveBeenCalledWith(['M-01', 'M_02'], 7);
    expect(repo.lineNumberExists).toHaveBeenCalledWith('001', 7);
  });
});
