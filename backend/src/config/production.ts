const DEFAULT_SECRET_VALUES = new Set([
  'change_me_in_production',
  'jwt_secret_change_me_in_production',
  'admin123',
  'sentinel_password',
]);

const REQUIRED_PRODUCTION_ENV = [
  'DATABASE_URL',
  'ADMIN_USERNAME',
  'ADMIN_PASSWORD',
  'COOKIE_SECRET',
  'JWT_SECRET',
  'CLIENT_ORIGIN',
  'BOARD_ACCESS_CODE_HASH',
] as const;

const MIN_SECRET_LENGTH = 24;
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/i;

function isWeakSecret(value: string | undefined): boolean {
  if (!value) return true;
  if (DEFAULT_SECRET_VALUES.has(value)) return true;
  return value.length < MIN_SECRET_LENGTH;
}

export function assertProductionConfig(): void {
  if (process.env.NODE_ENV !== 'production') return;

  const missing = REQUIRED_PRODUCTION_ENV.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing production environment variables: ${missing.join(', ')}`);
  }

  const weakSecrets = ['ADMIN_PASSWORD', 'COOKIE_SECRET', 'JWT_SECRET'].filter((name) =>
    isWeakSecret(process.env[name])
  );
  if (weakSecrets.length > 0) {
    throw new Error(`Unsafe production secret values: ${weakSecrets.join(', ')}`);
  }

  if (process.env.CLIENT_ORIGIN?.includes('localhost')) {
    throw new Error('CLIENT_ORIGIN must not point to localhost in production.');
  }

  if (process.env.DATABASE_URL?.includes('sentinel_password')) {
    throw new Error('DATABASE_URL must not use the default demo database password in production.');
  }

  if (!SHA256_HEX_PATTERN.test(process.env.BOARD_ACCESS_CODE_HASH || '')) {
    throw new Error('BOARD_ACCESS_CODE_HASH must be a valid SHA-256 hex digest in production.');
  }

  // TRUST_PROXY is required when running behind a reverse proxy (Caddy, nginx, etc.)
  // so that req.ip reflects the real client IP for rate limiting.
  if (!process.env.TRUST_PROXY) {
    console.warn(
      '[config] WARNING: TRUST_PROXY is not set. If the app runs behind a reverse proxy, ' +
      'rate limiting will key on the proxy IP instead of the real client IP. ' +
      'Set TRUST_PROXY=true in your .env to fix this.'
    );
  }

  // DEEPSEEK_API_KEY is optional — the support chat degrades gracefully when absent.
  if (!process.env.DEEPSEEK_API_KEY) {
    console.warn(
      '[config] WARNING: DEEPSEEK_API_KEY is not set. The support chat feature will be disabled.'
    );
  }
}
