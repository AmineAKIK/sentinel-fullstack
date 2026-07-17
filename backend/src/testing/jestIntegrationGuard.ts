import { assertSafeTestDatabaseUrl } from './databaseGuard';

assertSafeTestDatabaseUrl(process.env.DATABASE_URL, 'integration');
