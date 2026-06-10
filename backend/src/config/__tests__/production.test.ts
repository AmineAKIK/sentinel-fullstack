import { assertProductionConfig } from '../production';

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
    BOARD_ACCESS_CODE_HASH: '0315b4020af3eccab7706679580ac87a710d82970733b8719e70af9b57e7b9e6',
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

  it('rejects localhost production origin', () => {
    setProductionEnv({ CLIENT_ORIGIN: 'http://localhost:5173' });

    expect(() => assertProductionConfig()).toThrow('CLIENT_ORIGIN');
  });

  it('rejects missing board access hash', () => {
    setProductionEnv({ BOARD_ACCESS_CODE_HASH: '' });

    expect(() => assertProductionConfig()).toThrow('BOARD_ACCESS_CODE_HASH');
  });

  it('rejects invalid board access hash', () => {
    setProductionEnv({ BOARD_ACCESS_CODE_HASH: 'replace_with_sha256_of_board_code' });

    expect(() => assertProductionConfig()).toThrow('BOARD_ACCESS_CODE_HASH');
  });
});
