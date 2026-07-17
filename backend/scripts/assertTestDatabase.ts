import 'dotenv/config';
import { assertSafeTestDatabaseUrl, type TestDatabasePurpose } from '../src/testing/databaseGuard';

const purpose = process.argv[2] as TestDatabasePurpose | undefined;
if (purpose !== 'e2e' && purpose !== 'integration') {
  throw new Error('Usage: assertTestDatabase.ts <e2e|integration>');
}

assertSafeTestDatabaseUrl(process.env.DATABASE_URL, purpose);
console.log(`Test database guard passed for ${purpose}.`);
