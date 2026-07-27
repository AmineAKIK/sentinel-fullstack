import type { Response } from 'express';
import { sendError, PUBLIC_ERROR_MESSAGE } from '../errors';

// Mock minimal d'une réponse Express : capture le status et le corps JSON.
function makeRes() {
  const captured: { status?: number; body?: unknown } = {};
  const res = {
    status(code: number) {
      captured.status = code;
      return res;
    },
    json(body: unknown) {
      captured.body = body;
      return res;
    },
  } as unknown as Response;
  return { res, captured };
}

describe('sendError — contrat d’erreur public (lot 2 RC3)', () => {
  it('reste rétrocompatible : sans details, le corps garde { error: { code, message } }', () => {
    const { res, captured } = makeRes();
    sendError(res, 400, 'VALIDATION_ERROR', PUBLIC_ERROR_MESSAGE);
    expect(captured.status).toBe(400);
    expect(captured.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: PUBLIC_ERROR_MESSAGE },
    });
  });

  it('joint un bloc details structuré et sémantique quand il est fourni', () => {
    const { res, captured } = makeRes();
    sendError(res, 400, 'VALIDATION_ERROR', PUBLIC_ERROR_MESSAGE, {
      field: 'boardSessionDuration',
      reason: 'OUT_OF_RANGE',
      min: 1,
      max: 168,
    });
    expect(captured.body).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: PUBLIC_ERROR_MESSAGE,
        details: { field: 'boardSessionDuration', reason: 'OUT_OF_RANGE', min: 1, max: 168 },
      },
    });
  });

  it('n’expose jamais le message générique un identifiant interne', () => {
    // Le message par défaut du contrat public ne contient aucun nom de champ.
    expect(PUBLIC_ERROR_MESSAGE).not.toMatch(/_/);
    expect(PUBLIC_ERROR_MESSAGE).not.toMatch(/board_session|ttl|hours|snake/i);
  });
});
