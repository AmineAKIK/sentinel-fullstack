import bcrypt from 'bcrypt';

export const BCRYPT_ROUNDS_WORKSHOP = 10;
export const BCRYPT_ROUNDS_ADMIN = 12;

export const MIN_PASSWORD_LENGTH_WORKSHOP = 6;
export const MIN_PASSWORD_LENGTH_ADMIN = 12;

export function hashWorkshopPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS_WORKSHOP);
}

export function hashAdminPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS_ADMIN);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
