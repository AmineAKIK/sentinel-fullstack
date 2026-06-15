import { Response } from 'express';
import { SESSION_DURATION_MS } from './session';

export const ADMIN_AUTH_COOKIE = 'sentinel_admin_token';
export const WORKSHOP_AUTH_COOKIE = 'sentinel_workshop_token';

const isProduction = process.env.NODE_ENV === 'production';

export const authCookieOptions = {
  httpOnly: true,
  sameSite: (isProduction ? 'strict' : 'lax'),
  secure: isProduction,
};

export const persistentAuthCookieOptions = {
  ...authCookieOptions,
  maxAge: SESSION_DURATION_MS,
};

export function setAuthCookie(res: Response, name: string, token: string): void {
  res.cookie(name, token, persistentAuthCookieOptions);
}

export function clearAuthCookie(res: Response, name: string): void {
  res.clearCookie(name, authCookieOptions);
}
