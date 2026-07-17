import type { NextFunction, Request, Response } from 'express';
import logger from '../../logger';
import { apiErrorHandler, apiNotFoundHandler } from '../apiErrors';

jest.mock('../../logger', () => ({
  __esModule: true,
  default: { error: jest.fn() },
}));

function responseMock(): {
  response: Response;
  status: jest.Mock;
  json: jest.Mock;
} {
  const status = jest.fn().mockReturnThis();
  const json = jest.fn().mockReturnThis();
  return {
    response: { status, json, headersSent: false } as unknown as Response,
    status,
    json,
  };
}

describe('API terminal handlers', () => {
  const request = {} as Request;
  const next = jest.fn() as NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the shared JSON envelope for an unknown API route', () => {
    const { response, status, json } = responseMock();

    apiNotFoundHandler(request, response, next);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'NOT_FOUND', message: 'Route API introuvable.' },
    });
  });

  it('returns a validation error for malformed JSON', () => {
    const { response, status, json } = responseMock();

    apiErrorHandler({ type: 'entity.parse.failed' }, request, response, next);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'VALIDATION_ERROR', message: 'Corps JSON invalide.' },
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('returns a bounded validation error for an oversized body', () => {
    const { response, status, json } = responseMock();

    apiErrorHandler({ status: 413 }, request, response, next);

    expect(status).toHaveBeenCalledWith(413);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'VALIDATION_ERROR', message: 'Corps de requête trop volumineux.' },
    });
  });

  it('hides unexpected server errors and logs the original error', () => {
    const { response, status, json } = responseMock();
    const error = new Error('database detail');

    apiErrorHandler(error, request, response, next);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'SERVER_ERROR', message: 'Erreur interne du serveur.' },
    });
    expect(logger.error).toHaveBeenCalledWith({ err: error }, 'Unhandled API error');
  });

  it('delegates an error when the response has already started', () => {
    const { response, status, json } = responseMock();
    Object.defineProperty(response, 'headersSent', { value: true });
    const error = new Error('stream failed');

    apiErrorHandler(error, request, response, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(status).not.toHaveBeenCalled();
    expect(json).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });
});
