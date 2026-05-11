import { Response } from 'express';

export const ADMIN_AUTH_COOKIE = 'sentinel_admin_token';
export const WORKSHOP_AUTH_COOKIE = 'sentinel_workshop_token';

export const AUTH_COOKIE_MAX_AGE_MS = 8 * 60 * 60 * 1000;

export const authCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
};

export const persistentAuthCookieOptions = {
  ...authCookieOptions,
  maxAge: AUTH_COOKIE_MAX_AGE_MS,
};

export function setAuthCookie(res: Response, name: string, token: string): void {
  res.cookie(name, token, persistentAuthCookieOptions);
}

export function clearAuthCookie(res: Response, name: string): void {
  res.clearCookie(name, authCookieOptions);
}
