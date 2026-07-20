import {
  hasMinimumPasswordLength,
  isWithinBcryptByteLimit,
  MAX_PASSWORD_BYTES,
  passwordCharacterLength,
  utf8ByteLength,
} from '../passwordPolicy';

describe('passwordPolicy', () => {
  it('accepte exactement 72 octets ASCII et refuse le suivant', () => {
    expect(isWithinBcryptByteLimit('a'.repeat(MAX_PASSWORD_BYTES))).toBe(true);
    expect(isWithinBcryptByteLimit('a'.repeat(MAX_PASSWORD_BYTES + 1))).toBe(false);
  });

  it('mesure les octets UTF-8 sans confondre caractères et octets', () => {
    expect(passwordCharacterLength('é'.repeat(36))).toBe(36);
    expect(utf8ByteLength('é'.repeat(36))).toBe(72);
    expect(isWithinBcryptByteLimit(`${'é'.repeat(36)}a`)).toBe(false);
  });

  it('compte un point de code non BMP comme un caractère', () => {
    expect(hasMinimumPasswordLength('🔒'.repeat(10), 10)).toBe(true);
  });
});
