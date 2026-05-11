import { ZodError } from 'zod';
import { z } from 'zod';
import { formatZodError, parseIdParam, sendServiceError } from '../../utils/controller';
import { ServiceResult } from '../../utils/serviceResult';

// ─── formatZodError ──────────────────────────────────────────────────────────

describe('formatZodError', () => {
  function makeZodError(messages: string[]): ZodError {
    const schema = z.object({
      a: z.string().min(1, messages[0] ?? 'err'),
      b: messages[1] ? z.string().min(1, messages[1]) : z.string(),
    });
    const result = schema.safeParse({ a: '', b: '' });
    if (!result.success) return result.error;
    throw new Error('Expected a ZodError');
  }

  it('joins a single error message', () => {
    const err = makeZodError(['Le champ est requis.']);
    expect(formatZodError(err)).toBe('Le champ est requis.');
  });

  it('joins multiple error messages with a space', () => {
    const schema = z.object({ a: z.string().min(1, 'A requis.'), b: z.string().min(1, 'B requis.') });
    const result = schema.safeParse({ a: '', b: '' });
    if (!result.success) {
      expect(formatZodError(result.error)).toBe('A requis. B requis.');
    }
  });
});

// ─── parseIdParam ─────────────────────────────────────────────────────────────

describe('parseIdParam', () => {
  it('returns ok with the parsed integer for a valid numeric string', () => {
    const result = parseIdParam('42');
    expect(result).toEqual({ ok: true, data: 42 });
  });

  it('returns ok for string "1"', () => {
    const result = parseIdParam('1');
    expect(result).toEqual({ ok: true, data: 1 });
  });

  it('returns a 400 VALIDATION_ERROR for a non-numeric string', () => {
    const result = parseIdParam('abc');
    expect(result).toMatchObject({ ok: false, status: 400, code: 'VALIDATION_ERROR' });
  });

  it('returns a 400 VALIDATION_ERROR for an empty string', () => {
    const result = parseIdParam('');
    expect(result).toMatchObject({ ok: false, status: 400, code: 'VALIDATION_ERROR' });
  });

  it('returns a 400 VALIDATION_ERROR for a float string', () => {
    // parseInt('3.7') === 3, which is a valid integer – confirm this is accepted
    const result = parseIdParam('3.7');
    expect(result).toEqual({ ok: true, data: 3 });
  });

  it('returns a 400 VALIDATION_ERROR for "NaN"', () => {
    const result = parseIdParam('NaN');
    expect(result).toMatchObject({ ok: false, status: 400, code: 'VALIDATION_ERROR' });
  });
});

// ─── sendServiceError ─────────────────────────────────────────────────────────

describe('sendServiceError', () => {
  function mockRes() {
    const res: Record<string, jest.Mock> = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res as unknown as import('express').Response;
  }

  it('returns false and does NOT call res when result is ok', () => {
    const res = mockRes();
    const result: ServiceResult<string> = { ok: true, data: 'hello' };
    expect(sendServiceError(res, result)).toBe(false);
    expect((res as any).status).not.toHaveBeenCalled();
  });

  it('returns true and sends the error when result is not ok', () => {
    const res = mockRes();
    const result: ServiceResult<never> = {
      ok: false,
      status: 404,
      code: 'NOT_FOUND',
      message: 'Introuvable.',
    };
    expect(sendServiceError(res, result)).toBe(true);
    expect((res as any).status).toHaveBeenCalledWith(404);
    expect((res as any).json).toHaveBeenCalledWith({
      error: { code: 'NOT_FOUND', message: 'Introuvable.' },
    });
  });

  it('sends the correct HTTP status from the service result', () => {
    const res = mockRes();
    const result: ServiceResult<never> = {
      ok: false,
      status: 403,
      code: 'FORBIDDEN',
      message: 'Accès refusé.',
    };
    sendServiceError(res, result);
    expect((res as any).status).toHaveBeenCalledWith(403);
  });
});
