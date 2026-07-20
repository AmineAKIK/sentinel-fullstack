import bcrypt from 'bcrypt';
import {
  BCRYPT_ROUNDS_WORKSHOP,
  hasMinimumPasswordLength,
  isWithinBcryptByteLimit,
  MAX_PASSWORD_BYTES,
  MIN_BOARD_CODE_LENGTH,
} from '../auth/bcrypt';

async function main(): Promise<void> {
  const code = process.env.BOARD_ACCESS_CODE?.trim() ?? '';
  if (!hasMinimumPasswordLength(code, MIN_BOARD_CODE_LENGTH)) {
    throw new Error(
      `BOARD_ACCESS_CODE doit contenir au moins ${MIN_BOARD_CODE_LENGTH} caractères.`
    );
  }
  if (!isWithinBcryptByteLimit(code)) {
    throw new Error(`BOARD_ACCESS_CODE ne peut pas dépasser ${MAX_PASSWORD_BYTES} octets UTF-8.`);
  }

  process.stdout.write(`${await bcrypt.hash(code, BCRYPT_ROUNDS_WORKSHOP)}\n`);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Erreur inconnue.';
  process.stderr.write(`[hash-board-code] ${message}\n`);
  process.exitCode = 1;
});
