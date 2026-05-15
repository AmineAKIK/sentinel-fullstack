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
] as const;

function isWeakSecret(value: string | undefined): boolean {
  if (!value) return true;
  if (DEFAULT_SECRET_VALUES.has(value)) return true;
  return value.length < 24;
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
}
