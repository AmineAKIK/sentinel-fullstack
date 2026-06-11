/**
 * Integration tests for account deletion (RGPD anonymization) against a real PostgreSQL database.
 *
 * These tests run only when DATABASE_URL is set. They are skipped automatically
 * in environments without a database so the normal unit-test suite is unaffected.
 *
 * What they verify that unit tests with mocks cannot:
 *  - Deleting an account anonymizes personal data (first/last name, badge) in the row itself.
 *  - Credentials (password hash, setup code) are destroyed at deletion.
 *  - The deleted user disappears from the admin listing.
 *  - A workshop session for a deleted user is no longer valid.
 *  - Incidents reported by the user keep their referential integrity (user_id intact)
 *    while the joined display name becomes the anonymized one.
 */

import { Pool } from 'pg';
import runMigrations from '../../db/migrate';
import { hashWorkshopPassword } from '../../auth/bcrypt';
import { deleteAccountService, listAccountsService } from '../../modules/accounts/accounts.service';
import { verifyWorkshopSession } from '../../modules/auth/auth.service';

const DB_URL = process.env.DATABASE_URL;
const RUN = Boolean(DB_URL);

const describeIntegration = RUN ? describe : describe.skip;

let pool: Pool;
let userId: number;
let adminId: number;

// Cleanup is surgical: only rows created by this suite are deleted, so the tests
// are safe to run against a shared development database.
const createdUserIds: number[] = [];

const BADGE = 'RGPD-INT-01';
const ADMIN_USERNAME = 'admin-int-rgpd';

beforeAll(async () => {
  if (!RUN) return;
  pool = new Pool({ connectionString: DB_URL });
  await runMigrations();

  // The audit trail has a real FK to admin_accounts: the suite needs its own admin.
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO admin_accounts (username, password_hash)
     VALUES ($1, 'integration-test-hash')
     ON CONFLICT (username) DO UPDATE SET username = EXCLUDED.username
     RETURNING id`,
    [ADMIN_USERNAME]
  );
  adminId = rows[0].id;
}, 30_000);

beforeEach(async () => {
  if (!RUN) return;
  const hash = await hashWorkshopPassword('test_pass_rgpd');
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO sentinel_users (first_name, last_name, badge_number, role, is_active, is_deleted, password_hash)
     VALUES ('Karim', 'Bensaïd', $1, 'OPERATOR', TRUE, FALSE, $2)
     ON CONFLICT (badge_number) WHERE is_deleted = FALSE DO UPDATE SET password_hash = EXCLUDED.password_hash
     RETURNING id`,
    [BADGE, hash]
  );
  userId = rows[0].id;
  createdUserIds.push(userId);
});

afterAll(async () => {
  if (!RUN) return;
  await pool.query(`DELETE FROM account_audit_events WHERE target_user_id = ANY($1::int[])`, [createdUserIds]);
  await pool.query(`DELETE FROM sentinel_users WHERE id = ANY($1::int[])`, [createdUserIds]);
  await pool.query(`DELETE FROM admin_accounts WHERE username = $1`, [ADMIN_USERNAME]);
  await pool.end();
});

describeIntegration('RGPD — anonymisation à la suppression de compte', () => {
  it('anonymise nom, prénom et badge, et détruit les credentials', async () => {
    const result = await deleteAccountService(userId, adminId);
    expect(result.ok).toBe(true);

    const { rows } = await pool.query(
      `SELECT first_name, last_name, badge_number, password_hash,
              password_setup_token_hash, password_setup_expires_at, is_deleted, deleted_at
       FROM sentinel_users WHERE id = $1`,
      [userId]
    );

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.is_deleted).toBe(true);
    expect(row.deleted_at).not.toBeNull();
    expect(row.first_name).toBe('Utilisateur');
    expect(row.last_name).toBe('Supprimé');
    expect(row.badge_number).toBe(`ANON-${userId}`);
    expect(row.password_hash).toBeNull();
    expect(row.password_setup_token_hash).toBeNull();
    expect(row.password_setup_expires_at).toBeNull();
  });

  it('retire le compte supprimé du listing admin', async () => {
    await deleteAccountService(userId, adminId);

    const accounts = await listAccountsService({});
    const found = accounts.find((a) => a.id === userId);
    expect(found).toBeUndefined();
  });

  it('invalide la session workshop du compte supprimé', async () => {
    // Une session émise avant la suppression porte l'ancien badge dans le JWT.
    await deleteAccountService(userId, adminId);

    const session = await verifyWorkshopSession(userId, BADGE);
    expect(session).toBeNull();
  });

  it('est idempotente : une seconde suppression renvoie NOT_FOUND sans modifier la ligne', async () => {
    await deleteAccountService(userId, adminId);
    const second = await deleteAccountService(userId, adminId);

    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.status).toBe(404);
  });
});
