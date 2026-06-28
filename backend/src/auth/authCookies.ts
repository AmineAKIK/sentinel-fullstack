import type { CookieOptions, Response } from 'express';
import { sessionDurationMs } from './session';

export const ADMIN_AUTH_COOKIE = 'sentinel_admin_token';
export const WORKSHOP_AUTH_COOKIE = 'sentinel_workshop_token';

const isProduction = process.env.NODE_ENV === 'production';

export const authCookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: isProduction ? 'strict' : 'lax',
  secure: isProduction,
};

export function setAuthCookie(res: Response, name: string, token: string, durationHours: number): void {
  res.cookie(name, token, {
    ...authCookieOptions,
    maxAge: sessionDurationMs(durationHours),
  });
}

export function clearAuthCookie(res: Response, name: string): void {
  res.clearCookie(name, authCookieOptions);
}
