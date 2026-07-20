import { normalizeAdminUsername } from '../domain/identifiers';
import { isWithinBcryptByteLimit } from '../auth/bcrypt';

const DEFAULT_SECRET_VALUES = new Set([
  'change_me_in_production',
  'jwt_secret_change_me_in_production',
  'admin123',
  'sentinel_password',
]);

const PLACEHOLDER_MARKERS = ['change_me', 'replace_with', 'votre_', 'your_'];

const REQUIRED_PRODUCTION_ENV = [
  'DATABASE_URL',
  'COOKIE_SECRET',
  'JWT_SECRET',
  'CLIENT_ORIGIN',
  'TRUST_PROXY',
  'BOARD_ACCESS_CODE_HASH',
  'BUILD_SHA',
] as const;

const MIN_SECRET_LENGTH = 24;
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/i;

function containsPlaceholder(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    DEFAULT_SECRET_VALUES.has(normalized) ||
    PLACEHOLDER_MARKERS.some((marker) => normalized.includes(marker))
  );
}

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

export function parseIntegerEnv(
  value: string | undefined,
  name: string,
  fallback: number,
  min: number,
  max: number
): number {
  const normalized = value?.trim();
  if (!normalized) return fallback;
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }

  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
  return parsed;
}

export function parseTrustProxy(value: string | undefined): false | 1 {
  return parseBooleanEnv(value, 'TRUST_PROXY', false) ? 1 : false;
}

function isWeakSecret(value: string | undefined): boolean {
  if (!value) return true;
  if (value !== value.trim() || containsPlaceholder(value)) return true;
  return value.length < MIN_SECRET_LENGTH;
}

function assertProductionDatabaseUrl(rawValue: string): void {
  let databaseUrl: URL;
  try {
    databaseUrl = new URL(rawValue);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL in production.');
  }

  if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) {
    throw new Error('DATABASE_URL must use the postgres or postgresql protocol.');
  }

  let password: string;
  try {
    password = decodeURIComponent(databaseUrl.password);
  } catch {
    throw new Error('DATABASE_URL contains an invalid encoded password.');
  }

  const databaseName = databaseUrl.pathname.replace(/^\//, '');
  if (!databaseUrl.username || !password || !databaseUrl.hostname || !databaseName) {
    throw new Error('DATABASE_URL must include a user, password, host and database name.');
  }
  if (password.length < MIN_SECRET_LENGTH || containsPlaceholder(password)) {
    throw new Error('DATABASE_URL must use a strong non-placeholder database password.');
  }
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
  if (
    process.env.ADMIN_PASSWORD &&
    (isWeakSecret(process.env.ADMIN_PASSWORD) ||
      !isWithinBcryptByteLimit(process.env.ADMIN_PASSWORD))
  ) {
    weakSecrets.push('ADMIN_PASSWORD');
  }
  if (weakSecrets.length > 0) {
    throw new Error(`Unsafe production secret values: ${weakSecrets.join(', ')}`);
  }
  if (process.env.COOKIE_SECRET === process.env.JWT_SECRET) {
    throw new Error('COOKIE_SECRET and JWT_SECRET must be distinct in production.');
  }
  if (process.env.ADMIN_USERNAME) normalizeAdminUsername(process.env.ADMIN_USERNAME);

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
  const hostname = clientOrigin.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.example.com') ||
    hostname.endsWith('.example.test') ||
    hostname.endsWith('.invalid')
  ) {
    throw new Error('CLIENT_ORIGIN must not use a local or placeholder hostname in production.');
  }

  assertProductionDatabaseUrl(process.env.DATABASE_URL!);

  if (!BCRYPT_HASH_PATTERN.test(process.env.BOARD_ACCESS_CODE_HASH || '')) {
    throw new Error('BOARD_ACCESS_CODE_HASH must be a valid bcrypt digest in production.');
  }

  if (!GIT_SHA_PATTERN.test(process.env.BUILD_SHA || '')) {
    throw new Error('BUILD_SHA must be the full 40-character Git commit SHA in production.');
  }

  if (parseTrustProxy(process.env.TRUST_PROXY) !== 1) {
    throw new Error('TRUST_PROXY must be true in production behind the configured reverse proxy.');
  }

  parsePort(process.env.PORT, 'PORT', 3000);
  parseIntegerEnv(
    process.env.GLOBAL_API_RATE_LIMIT_MAX,
    'GLOBAL_API_RATE_LIMIT_MAX',
    3000,
    1,
    1_000_000
  );
  parseIntegerEnv(
    process.env.GLOBAL_API_RATE_LIMIT_WINDOW_MS,
    'GLOBAL_API_RATE_LIMIT_WINDOW_MS',
    900_000,
    1_000,
    86_400_000
  );
  parseIntegerEnv(
    process.env.SUPPORT_API_TIMEOUT_MS,
    'SUPPORT_API_TIMEOUT_MS',
    20_000,
    1_000,
    30_000
  );
  parseIntegerEnv(process.env.NOTIFICATION_BATCH_SIZE, 'NOTIFICATION_BATCH_SIZE', 10, 1, 100);
  parseIntegerEnv(process.env.NOTIFICATION_MAX_ATTEMPTS, 'NOTIFICATION_MAX_ATTEMPTS', 5, 1, 20);
  parseIntegerEnv(
    process.env.NOTIFICATION_POLL_INTERVAL_MS,
    'NOTIFICATION_POLL_INTERVAL_MS',
    5_000,
    100,
    60_000
  );

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
