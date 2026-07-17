import { assertSafeTestDatabaseUrl } from '../databaseGuard';

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

describe('assertSafeTestDatabaseUrl', () => {
  it('accepts dedicated databases for each test purpose', () => {
    expect(() =>
      assertSafeTestDatabaseUrl('postgres://sentinel:secret@localhost/sentinel_e2e', 'e2e')
    ).not.toThrow();
    expect(() =>
      assertSafeTestDatabaseUrl('postgres://sentinel:secret@localhost/sentinel_test', 'integration')
    ).not.toThrow();
  });

  it('rejects a database without the reserved suffix', () => {
    expect(() =>
      assertSafeTestDatabaseUrl('postgres://sentinel:secret@localhost/sentinel', 'e2e')
    ).toThrow('must end with _e2e');
  });

  it.each([
    [undefined, 'is required'],
    ['not-a-url', 'valid PostgreSQL URL'],
    ['mysql://sentinel:secret@localhost/sentinel_test', 'must use PostgreSQL'],
  ] as const)('rejects an unsafe integration URL %p', (databaseUrl, message) => {
    expect(() => assertSafeTestDatabaseUrl(databaseUrl, 'integration')).toThrow(message);
  });

  it('rejects any fixture execution in production mode', () => {
    process.env.NODE_ENV = 'production';

    expect(() =>
      assertSafeTestDatabaseUrl('postgres://sentinel:secret@localhost/sentinel_e2e', 'e2e')
    ).toThrow('NODE_ENV=production');
  });
});
