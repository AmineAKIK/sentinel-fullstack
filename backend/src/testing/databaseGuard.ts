export type TestDatabasePurpose = 'e2e' | 'integration';

function expectedSuffix(purpose: TestDatabasePurpose): RegExp {
  return purpose === 'e2e' ? /_e2e$/i : /_(?:test|integration)$/i;
}

export function assertSafeTestDatabaseUrl(
  rawDatabaseUrl: string | undefined,
  purpose: TestDatabasePurpose
): void {
  if (!rawDatabaseUrl) {
    throw new Error(`DATABASE_URL is required for ${purpose} tests.`);
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`Refusing to run ${purpose} fixtures with NODE_ENV=production.`);
  }

  let databaseUrl: URL;
  try {
    databaseUrl = new URL(rawDatabaseUrl);
  } catch {
    throw new Error(`DATABASE_URL must be a valid PostgreSQL URL for ${purpose} tests.`);
  }
  if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) {
    throw new Error(`DATABASE_URL must use PostgreSQL for ${purpose} tests.`);
  }

  let databaseName: string;
  try {
    databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//, ''));
  } catch {
    throw new Error(`DATABASE_URL contains an invalid database name for ${purpose} tests.`);
  }
  if (!expectedSuffix(purpose).test(databaseName)) {
    const suffix = purpose === 'e2e' ? '_e2e' : '_test or _integration';
    throw new Error(
      `Refusing to run ${purpose} fixtures against database "${databaseName || '(empty)'}". ` +
        `The database name must end with ${suffix}.`
    );
  }
}
