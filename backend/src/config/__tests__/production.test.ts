import { assertProductionConfig, parseBooleanEnv, parsePort, parseTrustProxy } from '../production';

const ORIGINAL_ENV = process.env;

function setProductionEnv(overrides: NodeJS.ProcessEnv = {}): void {
  process.env = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://sentinel:strong_database_password@postgres:5432/sentinel',
    ADMIN_USERNAME: 'admin',
    ADMIN_PASSWORD: 'very-long-admin-password',
    COOKIE_SECRET: '12345678901234567890123456789012',
    JWT_SECRET: 'abcdefghijklmnopqrstuvwxyz123456',
    CLIENT_ORIGIN: 'https://sentinel.example.com',
    TRUST_PROXY: 'true',
    BOARD_ACCESS_CODE_HASH: '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01234',
    DEEPSEEK_API_KEY: 'test-deepseek-key',
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: '587',
    SMTP_SECURE: 'false',
    SMTP_FROM: 'Sentinel <noreply@example.com>',
    ADMIN_EMAIL: 'admin@example.com',
    ...overrides,
  };
}

describe('assertProductionConfig', () => {
  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('allows non-production startup', () => {
    process.env = { NODE_ENV: 'development' };

    expect(() => assertProductionConfig()).not.toThrow();
  });

  it('rejects default production secrets', () => {
    setProductionEnv({ JWT_SECRET: 'jwt_secret_change_me_in_production' });

    expect(() => assertProductionConfig()).toThrow('Unsafe production secret values');
  });

  it('allows bootstrap admin credentials to be removed after first deployment', () => {
    setProductionEnv({ ADMIN_USERNAME: undefined, ADMIN_PASSWORD: undefined });

    expect(() => assertProductionConfig()).not.toThrow();
  });

  it('rejects a weak bootstrap password when one is provided', () => {
    setProductionEnv({ ADMIN_PASSWORD: 'admin123' });

    expect(() => assertProductionConfig()).toThrow('ADMIN_PASSWORD');
  });

  it('rejects localhost production origin', () => {
    setProductionEnv({ CLIENT_ORIGIN: 'http://localhost:5173' });

    expect(() => assertProductionConfig()).toThrow('CLIENT_ORIGIN');
  });

  it('rejects missing board access hash', () => {
    setProductionEnv({ BOARD_ACCESS_CODE_HASH: '' });

    expect(() => assertProductionConfig()).toThrow('BOARD_ACCESS_CODE_HASH');
  });

  it('rejects invalid board access hash', () => {
    setProductionEnv({ BOARD_ACCESS_CODE_HASH: 'replace_with_bcrypt_of_board_code' });

    expect(() => assertProductionConfig()).toThrow('BOARD_ACCESS_CODE_HASH');
  });

  it('rejects a legacy fast SHA-256 board hash', () => {
    setProductionEnv({
      BOARD_ACCESS_CODE_HASH: '0315b4020af3eccab7706679580ac87a710d82970733b8719e70af9b57e7b9e6',
    });

    expect(() => assertProductionConfig()).toThrow('bcrypt');
  });

  it('requires an HTTPS origin without a path', () => {
    setProductionEnv({ CLIENT_ORIGIN: 'http://sentinel.example.com' });
    expect(() => assertProductionConfig()).toThrow('HTTPS');

    setProductionEnv({ CLIENT_ORIGIN: 'https://sentinel.example.com/app' });
    expect(() => assertProductionConfig()).toThrow('origin');
  });

  it('requires explicit reverse-proxy trust in production', () => {
    setProductionEnv({ TRUST_PROXY: '' });
    expect(() => assertProductionConfig()).toThrow('TRUST_PROXY');

    setProductionEnv({ TRUST_PROXY: 'false' });
    expect(() => assertProductionConfig()).toThrow('must be true');
  });

  it('rejects invalid runtime ports', () => {
    setProductionEnv({ PORT: '3000oops' });
    expect(() => assertProductionConfig()).toThrow('PORT');

    setProductionEnv({ PORT: '65536' });
    expect(() => assertProductionConfig()).toThrow('PORT');
  });

  it('requires a coherent SMTP configuration when delivery is enabled', () => {
    setProductionEnv({ SMTP_HOST: 'smtp.example.com', SMTP_FROM: undefined });
    expect(() => assertProductionConfig()).toThrow('SMTP_FROM');

    setProductionEnv({
      SMTP_HOST: 'smtp.example.com',
      SMTP_FROM: 'Sentinel <noreply@example.com>',
      SMTP_USER: 'sentinel',
      SMTP_PASS: undefined,
    });
    expect(() => assertProductionConfig()).toThrow('configured together');

    setProductionEnv({
      SMTP_HOST: 'smtp.example.com',
      SMTP_FROM: 'Sentinel <noreply@example.com>',
      SMTP_PORT: 'invalid',
    });
    expect(() => assertProductionConfig()).toThrow('SMTP_PORT');
  });
});

describe('parseTrustProxy', () => {
  it.each([
    [undefined, false],
    ['', false],
    ['false', false],
    ['0', false],
    ['true', 1],
    ['1', 1],
    [' TRUE ', 1],
  ] as const)('normalise %p vers %p', (value, expected) => {
    expect(parseTrustProxy(value)).toBe(expected);
  });

  it('refuse les valeurs ambiguës', () => {
    expect(() => parseTrustProxy('loopback')).toThrow('TRUST_PROXY');
  });
});

describe('parsePort', () => {
  it.each([
    [undefined, 3000],
    ['', 3000],
    ['1', 1],
    [' 587 ', 587],
    ['65535', 65_535],
  ] as const)('normalise %p vers %p', (value, expected) => {
    expect(parsePort(value, 'PORT', 3000)).toBe(expected);
  });

  it.each(['0', '-1', '1.5', '3000oops', '65536'])('refuse %p', (value) => {
    expect(() => parsePort(value, 'PORT', 3000)).toThrow('PORT');
  });
});

describe('parseBooleanEnv', () => {
  it.each([
    [undefined, false],
    ['', false],
    ['true', true],
    ['1', true],
    ['false', false],
    ['0', false],
  ] as const)('normalise %p vers %p', (value, expected) => {
    expect(parseBooleanEnv(value, 'SMTP_SECURE', false)).toBe(expected);
  });

  it('refuse une valeur ambiguë', () => {
    expect(() => parseBooleanEnv('yes', 'SMTP_SECURE', false)).toThrow('SMTP_SECURE');
  });
});
