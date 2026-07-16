import bcrypt from 'bcrypt';
import { BCRYPT_ROUNDS_WORKSHOP } from '../auth/bcrypt';
import { FIELD_LIMITS } from '../domain/constants';

async function main(): Promise<void> {
  const code = process.env.BOARD_ACCESS_CODE?.trim() ?? '';
  if (code.length < 4 || code.length > FIELD_LIMITS.CODE) {
    throw new Error(`BOARD_ACCESS_CODE doit contenir entre 4 et ${FIELD_LIMITS.CODE} caractères.`);
  }

  process.stdout.write(`${await bcrypt.hash(code, BCRYPT_ROUNDS_WORKSHOP)}\n`);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Erreur inconnue.';
  process.stderr.write(`[hash-board-code] ${message}\n`);
  process.exitCode = 1;
});
