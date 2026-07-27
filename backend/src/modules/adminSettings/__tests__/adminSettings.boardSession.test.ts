import type { Request, Response } from 'express';

// Le contrat lot 3 : la valeur 0 de board_session_ttl_hours (marqueur interne
// « sans expiration automatique ») est ACCEPTÉE par la validation, alors qu'elle
// était rejetée (min 1). On mocke la couche de persistance pour observer que le
// handler dépasse la validation et transmet 0 à updateAppSettings.

jest.mock('../../adminCredentials/adminCredentials.repository', () => ({
  updateAppSettings: jest.fn(),
  getAppSettingsById: jest.fn(),
  incrementAdminSessionVersion: jest.fn(),
  incrementAllWorkshopSessionVersions: jest.fn(),
  incrementBoardSessionVersion: jest.fn(),
  getAdminNotifPrefs: jest.fn(),
  updateAdminNotifPrefs: jest.fn(),
  getBoardSettings: jest.fn(),
  updateBoardEnabled: jest.fn(),
  updateBoardCodeHash: jest.fn(),
}));

jest.mock('../../adminAudit/adminAudit.events', () => ({
  createAdminSystemAuditEvent: jest.fn(),
}));

jest.mock('../../../db/transaction', () => ({
  withTransaction: (fn: (client: unknown) => Promise<unknown>) => fn({}),
}));

import { patchAppSettingsHandler } from '../adminSettings.controller';
import {
  updateAppSettings,
  getAppSettingsById,
} from '../../adminCredentials/adminCredentials.repository';

const mockedUpdate = jest.mocked(updateAppSettings);
const mockedGet = jest.mocked(getAppSettingsById);

function makeRes() {
  const captured: { status?: number; body?: { error?: { code: string; details?: unknown } } } = {};
  const res = {
    status(code: number) {
      captured.status = code;
      return res;
    },
    json(body: unknown) {
      captured.body = body as typeof captured.body;
      return res;
    },
  } as unknown as Response;
  return { res, captured };
}

function makeReq(body: Record<string, unknown>): Request {
  return { admin: { adminId: 1 }, body } as unknown as Request;
}

describe('board_session_ttl_hours = 0 (sans expiration automatique, lot 3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGet.mockResolvedValue({
      session_duration_hours: 8,
      workshop_session_hours: 8,
      board_session_ttl_hours: 0,
      login_max_attempts: 10,
      setup_code_ttl_hours: 24,
      board_label: 'Atelier',
    });
  });

  it('accepte 0 et le transmet à la persistance (aucune erreur de validation)', async () => {
    const { res, captured } = makeRes();
    await patchAppSettingsHandler(makeReq({ board_session_ttl_hours: 0 }), res);

    // Pas d'erreur OUT_OF_RANGE : la validation a laissé passer 0.
    expect(captured.body?.error).toBeUndefined();
    expect(mockedUpdate).toHaveBeenCalledTimes(1);
    const patchArg = mockedUpdate.mock.calls[0][1] as Record<string, unknown>;
    expect(patchArg.board_session_ttl_hours).toBe(0);
  });

  it('rejette toujours une valeur hors plage (0 est la seule exception)', async () => {
    const { res, captured } = makeRes();
    await patchAppSettingsHandler(makeReq({ board_session_ttl_hours: 200 }), res);
    expect(captured.status).toBe(400);
    expect(captured.body?.error?.details).toMatchObject({
      field: 'boardSessionDuration',
      reason: 'OUT_OF_RANGE',
    });
    expect(mockedUpdate).not.toHaveBeenCalled();

    const negative = makeRes();
    await patchAppSettingsHandler(makeReq({ board_session_ttl_hours: -1 }), negative.res);
    expect(negative.captured.status).toBe(400);
  });
});
