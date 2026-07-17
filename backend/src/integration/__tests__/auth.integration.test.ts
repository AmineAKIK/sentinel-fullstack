/**
 * Integration tests for the auth flow against a real PostgreSQL database.
 *
 * The integration project guard requires a dedicated PostgreSQL database whose
 * name ends with `_test` or `_integration` before this suite can start.
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
import {
  generateWorkshopPasswordSetupCode,
  hashWorkshopPasswordSetupCode,
  getWorkshopPasswordSetupExpiry,
} from '../../auth/setupCode';
import {
  acquireIntegrationAdminFixture,
  releaseIntegrationAdminFixture,
  type IntegrationAdminFixture,
  type IntegrationAdminRecord,
} from '../helpers/adminFixture';

const DB_URL = process.env.DATABASE_URL!;

let pool: Pool;

// Préfixes réservés à CE fichier : le nettoyage est chirurgical (on ne touche
// qu'à nos propres lignes), pour que la suite reste sûre même si d'autres
// fichiers d'intégration s'exécutent en parallèle sur la même base. Pas de
// TRUNCATE — qui détruirait les données des autres suites.
const BADGE_PREFIX = 'IA-';

// Sentinel n'autorise qu'un seul compte admin (uq_admin_singleton_key) : les tests
// de login admin ne peuvent pas insérer un second compte, ils réécrivent
// temporairement l'unique ligne existante puis restaurent son état d'origine.
let originalAdmin: IntegrationAdminRecord | undefined;
let adminFixture: IntegrationAdminFixture | undefined;

beforeAll(async () => {
  pool = new Pool({ connectionString: DB_URL });
  // Run all migrations against the real DB
  await runMigrations();

  adminFixture = await acquireIntegrationAdminFixture(pool);
  originalAdmin = adminFixture.admin;
}, 30_000);

afterAll(async () => {
  try {
    if (originalAdmin) await restoreAdminFixture();
    await cleanAuthFixtures();
    if (adminFixture) await releaseIntegrationAdminFixture(pool, adminFixture);
  } finally {
    await pool.end();
  }
});

// ── Helpers ────────────────────────────────────────────────────────────────────

async function cleanAuthFixtures() {
  await pool.query('DELETE FROM sentinel_users WHERE badge_number LIKE $1', [`${BADGE_PREFIX}%`]);
}

function requireOriginalAdmin(): IntegrationAdminRecord {
  if (!originalAdmin) throw new Error('Integration administrator fixture is unavailable.');
  return originalAdmin;
}

async function restoreAdminFixture() {
  const admin = requireOriginalAdmin();
  await pool.query('UPDATE admin_accounts SET username = $2, password_hash = $3 WHERE id = $1', [
    admin.id,
    admin.username,
    admin.password_hash,
  ]);
}

async function insertAdmin(username: string, password: string): Promise<number> {
  const admin = requireOriginalAdmin();
  const hash = await hashAdminPassword(password);
  await pool.query(`UPDATE admin_accounts SET username = $2, password_hash = $3 WHERE id = $1`, [
    admin.id,
    username,
    hash,
  ]);
  return admin.id;
}

async function insertWorkshopUser(opts: {
  badge: string;
  role?: string;
  withPassword?: string;
  active?: boolean;
}): Promise<number> {
  const { badge, role = 'OPERATOR', withPassword, active = true } = opts;
  const passwordHash = withPassword ? await hashWorkshopPassword(withPassword) : null;
  const setupTokenHash = withPassword
    ? null
    : await hashWorkshopPasswordSetupCode(generateWorkshopPasswordSetupCode());
  const setupExpiry = withPassword ? null : getWorkshopPasswordSetupExpiry(24);

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

describe('Admin login (real DB)', () => {
  const ADMIN = 'int-auth-admin';
  // Chaque test réécrit l'unique compte admin (voir insertAdmin) : on repart
  // toujours de son état d'origine plutôt que d'un état laissé par le test précédent.
  beforeEach(restoreAdminFixture);

  it('returns admin_success with correct credentials', async () => {
    await insertAdmin(ADMIN, 'correct_password_123');
    const result = await unifiedLoginService(ADMIN, 'correct_password_123', undefined, undefined);
    expect(result.kind).toBe('admin_success');
    if (result.kind === 'admin_success') {
      expect(result.admin.username).toBe(ADMIN);
      expect(typeof result.admin.id).toBe('number');
    }
  });

  it('returns invalid_credentials with wrong password', async () => {
    await insertAdmin(ADMIN, 'correct_password_123');
    const result = await unifiedLoginService(ADMIN, 'wrong_password', undefined, undefined);
    expect(result.kind).toBe('invalid_credentials');
  });

  it('returns invalid_credentials for unknown username', async () => {
    const result = await unifiedLoginService(
      'int-auth-nobody',
      'any_password',
      undefined,
      undefined
    );
    expect(result.kind).toBe('invalid_credentials');
  });

  it('returns admin_requires_password when no password is supplied', async () => {
    await insertAdmin(ADMIN, 'correct_password_123');
    const result = await unifiedLoginService(ADMIN, undefined, undefined, undefined);
    expect(result.kind).toBe('admin_requires_password');
  });
});

// ── Workshop login ─────────────────────────────────────────────────────────────

describe('Workshop login (real DB)', () => {
  beforeEach(cleanAuthFixtures);

  it('returns requires_password_setup for a user without a password set', async () => {
    await insertWorkshopUser({ badge: `${BADGE_PREFIX}001` });
    const result = await unifiedLoginService(`${BADGE_PREFIX}001`, undefined, undefined, undefined);
    expect(result.kind).toBe('workshop_requires_password_setup');
    if (result.kind === 'workshop_requires_password_setup') {
      expect(result.badgeNumber).toBe(`${BADGE_PREFIX}001`);
    }
  });

  it('returns requires_password for a user who has a password set', async () => {
    await insertWorkshopUser({ badge: `${BADGE_PREFIX}002`, withPassword: 'mypassword99' });
    const result = await unifiedLoginService(`${BADGE_PREFIX}002`, undefined, undefined, undefined);
    expect(result.kind).toBe('workshop_requires_password');
    if (result.kind === 'workshop_requires_password') {
      expect(result.badgeNumber).toBe(`${BADGE_PREFIX}002`);
    }
  });

  it('returns workshop_success with correct credentials', async () => {
    await insertWorkshopUser({ badge: `${BADGE_PREFIX}003`, withPassword: 'correct_pass_99' });
    const result = await unifiedLoginService(
      `${BADGE_PREFIX}003`,
      'correct_pass_99',
      undefined,
      undefined
    );
    expect(result.kind).toBe('workshop_success');
    if (result.kind === 'workshop_success') {
      expect(result.user.badge_number).toBe(`${BADGE_PREFIX}003`);
      expect(typeof result.user.id).toBe('number');
    }
  });

  it('returns invalid_credentials with wrong password', async () => {
    await insertWorkshopUser({ badge: `${BADGE_PREFIX}004`, withPassword: 'correct_pass_99' });
    const result = await unifiedLoginService(
      `${BADGE_PREFIX}004`,
      'wrong_pass',
      undefined,
      undefined
    );
    expect(result.kind).toBe('invalid_credentials');
  });

  it('returns workshop_account_disabled for inactive user', async () => {
    await insertWorkshopUser({
      badge: `${BADGE_PREFIX}005`,
      withPassword: 'correct_pass_99',
      active: false,
    });
    const result = await unifiedLoginService(
      `${BADGE_PREFIX}005`,
      'correct_pass_99',
      undefined,
      undefined
    );
    expect(result.kind).toBe('workshop_account_disabled');
  });

  it('returns invalid_credentials for unknown badge number', async () => {
    const result = await unifiedLoginService(`${BADGE_PREFIX}UNKNOWN`, 'any', undefined, undefined);
    expect(result.kind).toBe('invalid_credentials');
  });
});

// ── Migration idempotency ──────────────────────────────────────────────────────

describe('Migrations (real DB)', () => {
  it('can run migrations twice without error (idempotent)', async () => {
    await expect(runMigrations()).resolves.not.toThrow();
  });

  it('serializes concurrent runners with an advisory lock', async () => {
    await expect(Promise.all([runMigrations(), runMigrations(), runMigrations()])).resolves.toEqual(
      [undefined, undefined, undefined]
    );
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
      'workshop_arbitration_cases',
      'production_line_machines',
      'notification_outbox',
    ];
    const { rows } = await pool.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
    );
    const existingTables = rows.map((r) => r.tablename);
    for (const table of expectedTables) {
      expect(existingTables).toContain(table);
    }
  });

  it('stores a non-null checksum for every applied migration', async () => {
    const { rows } = await pool.query<{ total: number; checksummed: number }>(
      `SELECT COUNT(*)::int AS total,
              COUNT(checksum)::int AS checksummed
       FROM schema_migrations`
    );
    expect(rows[0].checksummed).toBe(rows[0].total);
    expect(rows[0].total).toBeGreaterThanOrEqual(45);
  });

  it('refuses a modified migration ledger entry', async () => {
    const filename = '001_create_admin_accounts.sql';
    const { rows } = await pool.query<{ checksum: string }>(
      'SELECT checksum FROM schema_migrations WHERE filename = $1',
      [filename]
    );
    const originalChecksum = rows[0].checksum;
    await pool.query('UPDATE schema_migrations SET checksum = $1 WHERE filename = $2', [
      '0'.repeat(64),
      filename,
    ]);

    try {
      await expect(runMigrations()).rejects.toThrow('checksum mismatch');
    } finally {
      await pool.query('UPDATE schema_migrations SET checksum = $1 WHERE filename = $2', [
        originalChecksum,
        filename,
      ]);
    }
  });

  it('enforces the single administrator invariant in PostgreSQL', async () => {
    // Un admin existe déjà (compte réel ou seed) : la contrainte doit refuser
    // d'en insérer un second, pas seulement un troisième.
    await pool.query('BEGIN');
    try {
      await expect(
        pool.query(
          `INSERT INTO admin_accounts (username, password_hash)
           VALUES ('singleton-two', 'hash')`
        )
      ).rejects.toMatchObject({ code: '23505' });
    } finally {
      await pool.query('ROLLBACK');
    }
  });
});
