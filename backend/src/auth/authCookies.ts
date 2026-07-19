import type { CookieOptions, Request, Response } from 'express';
import { sessionDurationMs } from './session';

export const ADMIN_AUTH_COOKIE = 'sentinel_admin_token';
export const WORKSHOP_AUTH_COOKIE = 'sentinel_workshop_token';

const isProduction = process.env.NODE_ENV === 'production';

export const authCookieOptions: CookieOptions = {
  httpOnly: true,
  signed: true,
  sameSite: isProduction ? 'strict' : 'lax',
  secure: isProduction,
};

export function readSignedAuthCookie(req: Request, name: string): string | null {
  const value = req.signedCookies?.[name];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function hasTamperedAuthCookie(req: Request, name: string): boolean {
  return req.signedCookies?.[name] === false;
}

export function setAuthCookie(
  res: Response,
  name: string,
  token: string,
  durationHours: number
): void {
  res.cookie(name, token, {
    ...authCookieOptions,
    maxAge: sessionDurationMs(durationHours),
  });
}

export function clearAuthCookie(res: Response, name: string): void {
  res.clearCookie(name, authCookieOptions);
}
