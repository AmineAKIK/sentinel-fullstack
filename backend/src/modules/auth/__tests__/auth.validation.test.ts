import { loginSchema } from '../auth.validation';
import { FIELD_LIMITS } from '../../../domain/constants';
import { MAX_PASSWORD_LENGTH } from '../../../auth/bcrypt';

describe('loginSchema', () => {
  it('accepts a minimal payload with only an identifier', () => {
    const result = loginSchema.safeParse({ identifier: 'admin' });
    expect(result.success).toBe(true);
  });

  it('trims the identifier', () => {
    const result = loginSchema.safeParse({ identifier: '  admin  ' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.identifier).toBe('admin');
  });

  it('rejects a missing or empty identifier', () => {
    expect(loginSchema.safeParse({}).success).toBe(false);
    expect(loginSchema.safeParse({ identifier: '   ' }).success).toBe(false);
  });

  it('rejects an identifier longer than the limit', () => {
    const result = loginSchema.safeParse({ identifier: 'a'.repeat(FIELD_LIMITS.IDENTIFIER + 1) });
    expect(result.success).toBe(false);
  });

  it('rejects a password longer than the max', () => {
    const result = loginSchema.safeParse({
      identifier: 'admin',
      password: 'a'.repeat(MAX_PASSWORD_LENGTH + 1),
    });
    expect(result.success).toBe(false);
  });

  it('accepts a password at the max length', () => {
    const result = loginSchema.safeParse({
      identifier: 'admin',
      password: 'a'.repeat(MAX_PASSWORD_LENGTH),
    });
    expect(result.success).toBe(true);
  });

  it('rejects an oversized setupCode', () => {
    const result = loginSchema.safeParse({
      identifier: 'admin',
      setupCode: 'a'.repeat(FIELD_LIMITS.CODE + 1),
    });
    expect(result.success).toBe(false);
  });
});
