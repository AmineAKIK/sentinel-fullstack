import type { Request, Response } from 'express';
import { patchAppSettingsHandler } from '../adminSettings.controller';

// Réponse Express mockée : capture status + corps JSON.
function makeRes() {
  const captured: {
    status?: number;
    body?: { error?: { code: string; message: string; details?: unknown } };
  } = {};
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

describe('patchAppSettingsHandler — erreurs publiques structurées (lot 2 RC3)', () => {
  it('renvoie details publics pour une durée Board hors bornes, sans nom interne', async () => {
    const { res, captured } = makeRes();
    // board_session_ttl_hours interne, hors bornes (0). La validation précède
    // toute dépendance DB, donc aucun mock n'est nécessaire.
    await patchAppSettingsHandler(makeReq({ board_session_ttl_hours: 0 }), res);

    expect(captured.status).toBe(400);
    expect(captured.body?.error?.code).toBe('VALIDATION_ERROR');
    expect(captured.body?.error?.details).toEqual({
      field: 'boardSessionDuration',
      reason: 'OUT_OF_RANGE',
      min: 1,
      max: 168,
    });
  });

  it('mappe chaque réglage vers son champ public (jamais la colonne interne)', async () => {
    const cases: Array<{ internal: string; value: number; field: string }> = [
      { internal: 'session_duration_hours', value: 0, field: 'adminSessionDuration' },
      { internal: 'workshop_session_hours', value: 999, field: 'workshopSessionDuration' },
      { internal: 'board_session_ttl_hours', value: 0, field: 'boardSessionDuration' },
      { internal: 'login_max_attempts', value: 1, field: 'loginMaxAttempts' },
      { internal: 'setup_code_ttl_hours', value: 0, field: 'setupCodeDuration' },
    ];
    for (const c of cases) {
      const { res, captured } = makeRes();
      await patchAppSettingsHandler(makeReq({ [c.internal]: c.value }), res);
      expect(captured.body?.error?.details).toMatchObject({
        field: c.field,
        reason: 'OUT_OF_RANGE',
      });
    }
  });

  it('NÉGATIF : aucun identifiant interne (snake_case / nom de colonne) ne fuit dans la réponse', async () => {
    const internalNames = [
      'board_session_ttl_hours',
      'session_duration_hours',
      'workshop_session_hours',
      'login_max_attempts',
      'setup_code_ttl_hours',
      'notif_admin',
    ];
    // On teste plusieurs entrées invalides et on inspecte TOUT le corps sérialisé.
    for (const body of [
      { board_session_ttl_hours: 0 },
      { session_duration_hours: 9999 },
      { board_label: '' },
      { notif_should_not_exist: true },
    ]) {
      const { res, captured } = makeRes();
      await patchAppSettingsHandler(makeReq(body), res);
      const serialized = JSON.stringify(captured.body ?? {});
      for (const name of internalNames) {
        expect(serialized).not.toContain(name);
      }
      // Le message visible ne contient jamais d'underscore (marqueur snake_case).
      const message = captured.body?.error?.message ?? '';
      expect(message).not.toMatch(/_/);
    }
  });
});
