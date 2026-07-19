jest.mock('../../../auth/authCookies', () => ({
  ADMIN_AUTH_COOKIE: 'sentinel_admin_token',
  clearAuthCookie: jest.fn(),
}));

import type { Response } from 'express';
import { clearAuthCookie } from '../../../auth/authCookies';
import { sendAdminReauthenticationFailure } from '../adminReauthentication.http';

function responseMock(): {
  response: Response;
  status: jest.Mock;
  json: jest.Mock;
} {
  const status = jest.fn();
  const json = jest.fn();
  const response = { status, json } as unknown as Response;
  status.mockReturnValue(response);
  return { response, status, json };
}

beforeEach(() => {
  jest.clearAllMocks();
});

it('preserves the session before the fifth invalid password', () => {
  const { response, status, json } = responseMock();

  sendAdminReauthenticationFailure(response, 'INVALID_PASSWORD');

  expect(status).toHaveBeenCalledWith(401);
  expect(json).toHaveBeenCalledWith({
    error: { code: 'REAUTHENTICATION_FAILED', message: 'Mot de passe incorrect.' },
  });
  expect(clearAuthCookie).not.toHaveBeenCalled();
});

it('clears the cookie and exposes SESSION_REVOKED on the fifth failure', () => {
  const { response, status, json } = responseMock();

  sendAdminReauthenticationFailure(response, 'SESSION_REVOKED');

  expect(clearAuthCookie).toHaveBeenCalledWith(response, 'sentinel_admin_token');
  expect(status).toHaveBeenCalledWith(401);
  expect(json).toHaveBeenCalledWith({
    error: {
      code: 'SESSION_REVOKED',
      message: 'Session révoquée après cinq tentatives incorrectes.',
    },
  });
});
