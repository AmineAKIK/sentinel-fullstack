import crypto from 'crypto';
import { hashWorkshopPassword, verifyPassword } from './bcrypt';

const SETUP_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const SETUP_CODE_LENGTH = 10;

export const WORKSHOP_PASSWORD_SETUP_CODE_TTL_HOURS = 24;

export function generateWorkshopPasswordSetupCode(): string {
  const bytes = crypto.randomBytes(SETUP_CODE_LENGTH);
  return Array.from(bytes, (byte) => SETUP_CODE_ALPHABET[byte % SETUP_CODE_ALPHABET.length]).join('');
}

export function getWorkshopPasswordSetupExpiry(now = new Date()): Date {
  return new Date(now.getTime() + WORKSHOP_PASSWORD_SETUP_CODE_TTL_HOURS * 60 * 60 * 1000);
}

export function hashWorkshopPasswordSetupCode(code: string): Promise<string> {
  return hashWorkshopPassword(normalizeWorkshopPasswordSetupCode(code));
}

export function verifyWorkshopPasswordSetupCode(code: string, hash: string): Promise<boolean> {
  return verifyPassword(normalizeWorkshopPasswordSetupCode(code), hash);
}

export function normalizeWorkshopPasswordSetupCode(code: string): string {
  return code.trim().replace(/[\s-]/g, '').toUpperCase();
}
