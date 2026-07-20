import {
  MAX_PASSWORD_BYTES,
  hashWorkshopPassword,
  isWithinBcryptByteLimit,
  passwordCharacterLength,
  utf8ByteLength,
  verifyPassword,
} from '../bcrypt';

describe('bcrypt input boundaries', () => {
  it('accepts exactly 72 ASCII bytes and rejects the 73rd', () => {
    expect(utf8ByteLength('a'.repeat(MAX_PASSWORD_BYTES))).toBe(72);
    expect(isWithinBcryptByteLimit('a'.repeat(MAX_PASSWORD_BYTES))).toBe(true);
    expect(isWithinBcryptByteLimit('a'.repeat(MAX_PASSWORD_BYTES + 1))).toBe(false);
  });

  it('measures UTF-8 bytes independently from Unicode code points', () => {
    expect(passwordCharacterLength('é'.repeat(36))).toBe(36);
    expect(utf8ByteLength('é'.repeat(36))).toBe(72);
    expect(isWithinBcryptByteLimit('é'.repeat(36))).toBe(true);
    expect(isWithinBcryptByteLimit(`${'é'.repeat(36)}a`)).toBe(false);
  });

  it('never hashes or compares a value that bcrypt would truncate', async () => {
    const tooLong = 'a'.repeat(MAX_PASSWORD_BYTES + 1);

    await expect(hashWorkshopPassword(tooLong)).rejects.toThrow('72 octets UTF-8');
    await expect(verifyPassword(tooLong, '$2b$10$invalid')).resolves.toBe(false);
  });
});
