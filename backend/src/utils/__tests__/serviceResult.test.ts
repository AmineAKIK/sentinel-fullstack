import {
  ok,
  serviceError,
  badRequest,
  forbidden,
  notFound,
  conflict,
} from '../../utils/serviceResult';

describe('ok', () => {
  it('returns { ok: true, data: value }', () => {
    expect(ok(42)).toEqual({ ok: true, data: 42 });
  });

  it('works with object payloads', () => {
    const data = { id: 1, name: 'Ligne A' };
    expect(ok(data)).toEqual({ ok: true, data });
  });

  it('works with null', () => {
    expect(ok(null)).toEqual({ ok: true, data: null });
  });
});

describe('serviceError', () => {
  it('returns a well-formed error result', () => {
    expect(serviceError(422, 'VALIDATION_ERROR', 'Invalide.')).toEqual({
      ok: false,
      status: 422,
      code: 'VALIDATION_ERROR',
      message: 'Invalide.',
    });
  });
});

describe('badRequest', () => {
  it('returns status 400 with VALIDATION_ERROR code', () => {
    const result = badRequest('Le champ est requis.');
    expect(result).toMatchObject({ ok: false, status: 400, code: 'VALIDATION_ERROR' });
    expect(result).toMatchObject({ message: 'Le champ est requis.' });
  });
});

describe('forbidden', () => {
  it('returns status 403 with FORBIDDEN code', () => {
    const result = forbidden('Accès refusé.');
    expect(result).toMatchObject({ ok: false, status: 403, code: 'FORBIDDEN' });
    expect(result).toMatchObject({ message: 'Accès refusé.' });
  });
});

describe('notFound', () => {
  it('returns status 404 with NOT_FOUND code', () => {
    const result = notFound('Ressource introuvable.');
    expect(result).toMatchObject({ ok: false, status: 404, code: 'NOT_FOUND' });
  });
});

describe('conflict', () => {
  it('returns status 409 with the given error code', () => {
    const result = conflict('LINE_ALREADY_EXISTS', 'Cette ligne existe déjà.');
    expect(result).toMatchObject({ ok: false, status: 409, code: 'LINE_ALREADY_EXISTS' });
    expect(result).toMatchObject({ message: 'Cette ligne existe déjà.' });
  });

  it('accepts BADGE_ALREADY_EXISTS code', () => {
    const result = conflict('BADGE_ALREADY_EXISTS', 'Badge déjà utilisé.');
    expect(result).toMatchObject({ ok: false, status: 409, code: 'BADGE_ALREADY_EXISTS' });
  });
});
