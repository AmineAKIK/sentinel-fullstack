import type { Pool } from 'pg';
import { hashAdminPassword } from '../../auth/bcrypt';

export interface IntegrationAdminRecord {
  id: number;
  username: string;
  password_hash: string;
}

export interface IntegrationAdminFixture {
  admin: IntegrationAdminRecord;
  createdBySuite: boolean;
}

async function findAdmin(pool: Pool): Promise<IntegrationAdminRecord | undefined> {
  const { rows } = await pool.query<IntegrationAdminRecord>(
    'SELECT id, username, password_hash FROM admin_accounts ORDER BY id ASC LIMIT 1'
  );
  return rows[0];
}

export async function acquireIntegrationAdminFixture(pool: Pool): Promise<IntegrationAdminFixture> {
  const existingAdmin = await findAdmin(pool);
  if (existingAdmin) return { admin: existingAdmin, createdBySuite: false };

  const passwordHash = await hashAdminPassword('sentinel_integration_fixture_password');
  const { rows } = await pool.query<IntegrationAdminRecord>(
    `INSERT INTO admin_accounts (username, password_hash)
     VALUES ($1, $2)
     ON CONFLICT (singleton_key) DO NOTHING
     RETURNING id, username, password_hash`,
    ['sentinel-integration-admin', passwordHash]
  );

  if (rows[0]) return { admin: rows[0], createdBySuite: true };

  const concurrentlyCreatedAdmin = await findAdmin(pool);
  if (!concurrentlyCreatedAdmin) {
    throw new Error('Unable to provision the integration administrator fixture.');
  }
  return { admin: concurrentlyCreatedAdmin, createdBySuite: false };
}

export async function releaseIntegrationAdminFixture(
  pool: Pool,
  fixture: IntegrationAdminFixture
): Promise<void> {
  if (!fixture.createdBySuite) return;
  await pool.query('DELETE FROM admin_accounts WHERE id = $1', [fixture.admin.id]);
}
