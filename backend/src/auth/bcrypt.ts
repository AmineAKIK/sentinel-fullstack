import bcrypt from 'bcrypt';

export const BCRYPT_ROUNDS_WORKSHOP = 10;
export const BCRYPT_ROUNDS_ADMIN = 12;

export const MIN_PASSWORD_LENGTH_WORKSHOP = 10;
export const MIN_PASSWORD_LENGTH_ADMIN = 12;
export const MIN_BOARD_CODE_LENGTH = 6;
export const MAX_PASSWORD_BYTES = 72;

export function utf8ByteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

export function passwordCharacterLength(value: string): number {
  return Array.from(value).length;
}

export function isWithinBcryptByteLimit(value: string): boolean {
  return utf8ByteLength(value) <= MAX_PASSWORD_BYTES;
}

export function hasMinimumPasswordLength(value: string, minimum: number): boolean {
  return passwordCharacterLength(value) >= minimum;
}

function assertWithinBcryptByteLimit(value: string): Promise<void> {
  if (!isWithinBcryptByteLimit(value)) {
    return Promise.reject(
      new RangeError(`Le secret dépasse la limite bcrypt de ${MAX_PASSWORD_BYTES} octets UTF-8.`)
    );
  }
  return Promise.resolve();
}

export async function hashWorkshopPassword(plain: string): Promise<string> {
  await assertWithinBcryptByteLimit(plain);
  return bcrypt.hash(plain, BCRYPT_ROUNDS_WORKSHOP);
}

export async function hashAdminPassword(plain: string): Promise<string> {
  await assertWithinBcryptByteLimit(plain);
  return bcrypt.hash(plain, BCRYPT_ROUNDS_ADMIN);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!isWithinBcryptByteLimit(plain)) return Promise.resolve(false);
  return bcrypt.compare(plain, hash);
}
