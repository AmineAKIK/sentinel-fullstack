const DEFAULT_SECRET_VALUES = new Set([
  'change_me_in_production',
  'jwt_secret_change_me_in_production',
  'admin123',
  'sentinel_password',
]);

const REQUIRED_PRODUCTION_ENV = [
  'DATABASE_URL',
  'COOKIE_SECRET',
  'JWT_SECRET',
  'CLIENT_ORIGIN',
  'TRUST_PROXY',
  'BOARD_ACCESS_CODE_HASH',
] as const;

const MIN_SECRET_LENGTH = 24;
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

export function parsePort(value: string | undefined, name: string, fallback: number): number {
  const normalized = value?.trim();
  if (!normalized) return fallback;
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`${name} must be an integer between 1 and 65535.`);
  }

  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error(`${name} must be an integer between 1 and 65535.`);
  }
  return parsed;
}

export function parseBooleanEnv(
  value: string | undefined,
  name: string,
  fallback: boolean
): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  throw new Error(`${name} must be true/1 or false/0.`);
}

export function parseTrustProxy(value: string | undefined): false | 1 {
  return parseBooleanEnv(value, 'TRUST_PROXY', false) ? 1 : false;
}

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

  const weakSecrets = ['COOKIE_SECRET', 'JWT_SECRET'].filter((name) =>
    isWeakSecret(process.env[name])
  );
  if (process.env.ADMIN_PASSWORD && isWeakSecret(process.env.ADMIN_PASSWORD)) {
    weakSecrets.push('ADMIN_PASSWORD');
  }
  if (weakSecrets.length > 0) {
    throw new Error(`Unsafe production secret values: ${weakSecrets.join(', ')}`);
  }

  let clientOrigin: URL;
  try {
    clientOrigin = new URL(process.env.CLIENT_ORIGIN!);
  } catch {
    throw new Error('CLIENT_ORIGIN must be a valid absolute URL in production.');
  }
  if (clientOrigin.protocol !== 'https:' || clientOrigin.username || clientOrigin.password) {
    throw new Error('CLIENT_ORIGIN must be an HTTPS origin without embedded credentials.');
  }
  if (clientOrigin.pathname !== '/' || clientOrigin.search || clientOrigin.hash) {
    throw new Error('CLIENT_ORIGIN must contain only the HTTPS origin, without path or query.');
  }

  if (process.env.DATABASE_URL?.includes('sentinel_password')) {
    throw new Error('DATABASE_URL must not use the default demo database password in production.');
  }

  if (!BCRYPT_HASH_PATTERN.test(process.env.BOARD_ACCESS_CODE_HASH || '')) {
    throw new Error('BOARD_ACCESS_CODE_HASH must be a valid bcrypt digest in production.');
  }

  if (parseTrustProxy(process.env.TRUST_PROXY) !== 1) {
    throw new Error('TRUST_PROXY must be true in production behind the configured reverse proxy.');
  }

  parsePort(process.env.PORT, 'PORT', 3000);

  if (process.env.SMTP_HOST) {
    parsePort(process.env.SMTP_PORT, 'SMTP_PORT', 587);
    parseBooleanEnv(process.env.SMTP_SECURE, 'SMTP_SECURE', false);
    if (!process.env.SMTP_FROM) {
      throw new Error('SMTP_FROM is required when SMTP_HOST is configured in production.');
    }
    if (Boolean(process.env.SMTP_USER) !== Boolean(process.env.SMTP_PASS)) {
      throw new Error('SMTP_USER and SMTP_PASS must be configured together.');
    }
  }

  // DEEPSEEK_API_KEY is optional — the support chat degrades gracefully when absent.
  if (!process.env.DEEPSEEK_API_KEY) {
    console.warn(
      '[config] WARNING: DEEPSEEK_API_KEY is not set. The support chat feature will be disabled.'
    );
  }

  // SMTP is optional — email notifications degrade gracefully when absent.
  if (!process.env.SMTP_HOST || !process.env.ADMIN_EMAIL) {
    console.warn(
      '[config] WARNING: SMTP_HOST or ADMIN_EMAIL is not set. Email notifications will be disabled.'
    );
  }
}
