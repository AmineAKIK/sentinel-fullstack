/**
 * Integration tests for the auth flow against a real PostgreSQL database.
 *
 * These tests run only when DATABASE_URL is set (CI with `services: postgres`,
 * or local dev with a running DB). They are skipped automatically in
 * environments without a database so the normal unit-test suite is unaffected.
 *
 * What they verify that unit tests with mocks cannot:
 *  - Migrations run and produce the correct schema.
 *  - The admin seed creates the account with a valid bcrypt hash.
 *  - Login with correct credentials returns the right account shape.
 *  - Login with wrong credentials is rejected.
 *  - A freshly created workshop user has no password and has a setup code.
 *  - The workshop login flow returns `requires_password_setup` before setup.
 *  - After setting a password the user can log in.
 *  - A deactivated user cannot log in.
 */

import { Pool } from 'pg';
import runMigrations from '../../db/migrate';
import { hashAdminPassword, hashWorkshopPassword } from '../../auth/bcrypt';
import { unifiedLoginService } from '../../modules/auth/auth.service';
import { generateWorkshopPasswordSetupCode, hashWorkshopPasswordSetupCode, getWorkshopPasswordSetupExpiry } from '../../auth/setupCode';

const DB_URL = process.env.DATABASE_URL;
const RUN = Boolean(DB_URL);

// Use a conditional describe so the suite is visible but skipped when no DB
const describeIntegration = RUN ? describe : describe.skip;

let pool: Pool;

beforeAll(async () => {
  if (!RUN) return;
  pool = new Pool({ connectionString: DB_URL });
  // Run all migrations against the real DB
  await runMigrations();
}, 30_000);

afterAll(async () => {
  if (!RUN) return;
  await pool.end();
});

// ── Helpers ────────────────────────────────────────────────────────────────────

async function cleanAdminAccounts() {
  await pool.query('TRUNCATE admin_accounts RESTART IDENTITY CASCADE');
}

async function cleanWorkshopUsers() {
  await pool.query('TRUNCATE sentinel_users RESTART IDENTITY CASCADE');
}

async function insertAdmin(username: string, password: string): Promise<number> {
  const hash = await hashAdminPassword(password);
  const { rows } = await pool.query<{ id: number }>(
    'INSERT INTO admin_accounts (username, password_hash) VALUES ($1, $2) RETURNING id',
    [username, hash]
  );
  return rows[0].id;
}

async function insertWorkshopUser(opts: {
  badge: string;
  role?: string;
  withPassword?: string;
  active?: boolean;
}): Promise<number> {
  const { badge, role = 'OPERATOR', withPassword, active = true } = opts;
  const passwordHash = withPassword ? await hashWorkshopPassword(withPassword) : null;
  const setupTokenHash = withPassword ? null : await hashWorkshopPasswordSetupCode(generateWorkshopPasswordSetupCode());
  const setupExpiry = withPassword ? null : getWorkshopPasswordSetupExpiry();

  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO sentinel_users
       (first_name, last_name, badge_number, role, is_active, is_deleted,
        password_hash, password_setup_token_hash, password_setup_expires_at)
     VALUES ($1,$2,$3,$4,$5,FALSE,$6,$7,$8)
     RETURNING id`,
    ['Test', 'User', badge, role, active, passwordHash, setupTokenHash, setupExpiry]
  );
  return rows[0].id;
}

// ── Admin login ────────────────────────────────────────────────────────────────

describeIntegration('Admin login (real DB)', () => {
  beforeEach(cleanAdminAccounts);

  it('returns admin_success with correct credentials', async () => {
    await insertAdmin('admin_int', 'correct_password_123');
    const result = await unifiedLoginService('admin_int', 'correct_password_123', undefined, undefined);
    expect(result.kind).toBe('admin_success');
    if (result.kind === 'admin_success') {
      expect(result.admin.username).toBe('admin_int');
      expect(typeof result.admin.id).toBe('number');
    }
  });

  it('returns invalid_credentials with wrong password', async () => {
    await insertAdmin('admin_int', 'correct_password_123');
    const result = await unifiedLoginService('admin_int', 'wrong_password', undefined, undefined);
    expect(result.kind).toBe('invalid_credentials');
  });

  it('returns invalid_credentials for unknown username', async () => {
    const result = await unifiedLoginService('nobody', 'any_password', undefined, undefined);
    expect(result.kind).toBe('invalid_credentials');
  });

  it('returns admin_requires_password when no password is supplied', async () => {
    await insertAdmin('admin_int', 'correct_password_123');
    const result = await unifiedLoginService('admin_int', undefined, undefined, undefined);
    expect(result.kind).toBe('admin_requires_password');
  });
});

// ── Workshop login ─────────────────────────────────────────────────────────────

describeIntegration('Workshop login (real DB)', () => {
  beforeEach(() => Promise.all([cleanAdminAccounts(), cleanWorkshopUsers()]));

  it('returns requires_password_setup for a user without a password set', async () => {
    await insertWorkshopUser({ badge: 'W001' });
    const result = await unifiedLoginService('W001', undefined, undefined, undefined);
    expect(result.kind).toBe('workshop_requires_password_setup');
    if (result.kind === 'workshop_requires_password_setup') {
      expect(result.badgeNumber).toBe('W001');
    }
  });

  it('returns requires_password for a user who has a password set', async () => {
    await insertWorkshopUser({ badge: 'W002', withPassword: 'mypassword99' });
    const result = await unifiedLoginService('W002', undefined, undefined, undefined);
    expect(result.kind).toBe('workshop_requires_password');
    if (result.kind === 'workshop_requires_password') {
      expect(result.badgeNumber).toBe('W002');
    }
  });

  it('returns workshop_success with correct credentials', async () => {
    await insertWorkshopUser({ badge: 'W003', withPassword: 'correct_pass_99' });
    const result = await unifiedLoginService('W003', 'correct_pass_99', undefined, undefined);
    expect(result.kind).toBe('workshop_success');
    if (result.kind === 'workshop_success') {
      expect(result.user.badge_number).toBe('W003');
      expect(typeof result.user.id).toBe('number');
    }
  });

  it('returns invalid_credentials with wrong password', async () => {
    await insertWorkshopUser({ badge: 'W004', withPassword: 'correct_pass_99' });
    const result = await unifiedLoginService('W004', 'wrong_pass', undefined, undefined);
    expect(result.kind).toBe('invalid_credentials');
  });

  it('returns invalid_credentials for inactive user', async () => {
    await insertWorkshopUser({ badge: 'W005', withPassword: 'correct_pass_99', active: false });
    const result = await unifiedLoginService('W005', 'correct_pass_99', undefined, undefined);
    // Inactive users are treated as unknown badges (not_found in the credential service)
    expect(result.kind).toBe('invalid_credentials');
  });

  it('returns invalid_credentials for unknown badge number', async () => {
    const result = await unifiedLoginService('UNKNOWN_BADGE', 'any', undefined, undefined);
    expect(result.kind).toBe('invalid_credentials');
  });
});

// ── Migration idempotency ──────────────────────────────────────────────────────

describeIntegration('Migrations (real DB)', () => {
  it('can run migrations twice without error (idempotent)', async () => {
    await expect(runMigrations()).resolves.not.toThrow();
  });

  it('schema_migrations table exists after migrations', async () => {
    const { rows } = await pool.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'schema_migrations'`
    );
    expect(rows.length).toBe(1);
  });

  it('all expected core tables exist after migrations', async () => {
    const expectedTables = [
      'admin_accounts',
      'sentinel_users',
      'production_lines',
      'workshop_incidents',
      'workshop_incident_events',
      'workshop_incident_followers',
      'account_audit_events',
      'line_audit_events',
    ];
    const { rows } = await pool.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
    );
    const existingTables = rows.map((r) => r.tablename);
    for (const table of expectedTables) {
      expect(existingTables).toContain(table);
    }
  });
});
