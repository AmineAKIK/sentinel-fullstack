import type { Request, Response } from 'express';
import {
  ADMIN_AUTH_COOKIE,
  authCookieOptions,
  clearAuthCookie,
  hasTamperedAuthCookie,
  readSignedAuthCookie,
  setAuthCookie,
} from '../authCookies';

describe('authenticated cookie contract', () => {
  it('signs session cookies in addition to the JWT signature', () => {
    const cookie = jest.fn();
    const response = { cookie } as unknown as Response;

    setAuthCookie(response, ADMIN_AUTH_COOKIE, 'jwt-value', 2);

    expect(cookie).toHaveBeenCalledWith(
      ADMIN_AUTH_COOKIE,
      'jwt-value',
      expect.objectContaining({
        httpOnly: true,
        signed: true,
        maxAge: 2 * 60 * 60 * 1000,
      })
    );
    expect(authCookieOptions.signed).toBe(true);
  });

  it('uses the same signing scope when clearing a session cookie', () => {
    const clearCookie = jest.fn();
    const response = { clearCookie } as unknown as Response;

    clearAuthCookie(response, ADMIN_AUTH_COOKIE);

    expect(clearCookie).toHaveBeenCalledWith(
      ADMIN_AUTH_COOKIE,
      expect.objectContaining({ signed: true })
    );
  });

  it('accepts only a string supplied by cookie-parser signedCookies', () => {
    const validRequest = {
      signedCookies: { [ADMIN_AUTH_COOKIE]: 'verified-token' },
    } as unknown as Request;
    const tamperedRequest = {
      cookies: { [ADMIN_AUTH_COOKIE]: 'untrusted-token' },
      signedCookies: { [ADMIN_AUTH_COOKIE]: false },
    } as unknown as Request;

    expect(readSignedAuthCookie(validRequest, ADMIN_AUTH_COOKIE)).toBe('verified-token');
    expect(readSignedAuthCookie(tamperedRequest, ADMIN_AUTH_COOKIE)).toBeNull();
    expect(hasTamperedAuthCookie(tamperedRequest, ADMIN_AUTH_COOKIE)).toBe(true);
  });
});
