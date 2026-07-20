export const MIN_PASSWORD_LENGTH_WORKSHOP = 10;
export const MIN_PASSWORD_LENGTH_ADMIN = 12;
export const MIN_BOARD_CODE_LENGTH = 6;
export const MAX_PASSWORD_BYTES = 72;

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
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
