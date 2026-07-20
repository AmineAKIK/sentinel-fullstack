import crypto from 'crypto';
import { hashBoardCode, verifyBoardCode } from '../board.auth';

describe('board code hashing', () => {
  it('uses a slow bcrypt hash and verifies without exposing the code', async () => {
    const hash = await hashBoardCode('Atelier-42');

    expect(hash).toMatch(/^\$2[aby]\$/);
    await expect(verifyBoardCode('Atelier-42', hash)).resolves.toBe(true);
    await expect(verifyBoardCode('incorrect', hash)).resolves.toBe(false);
  });

  it('accepts a legacy SHA-256 digest for transparent migration', async () => {
    const legacy = crypto.createHash('sha256').update('1234').digest('hex');
    await expect(verifyBoardCode('1234', legacy)).resolves.toBe(true);
    await expect(verifyBoardCode('4321', legacy)).resolves.toBe(false);
  });

  it('refuses values beyond the 72-byte bcrypt boundary', async () => {
    const tooLong = `${'é'.repeat(36)}a`;

    await expect(hashBoardCode(tooLong)).rejects.toThrow('72 octets UTF-8');
    await expect(verifyBoardCode(tooLong, '$2b$10$invalid')).resolves.toBe(false);
  });
});
