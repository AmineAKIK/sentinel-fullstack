/**
 * Integration test for the Board session settings lifecycle (RC3, lot 3),
 * against a real PostgreSQL database.
 *
 * Exercises the persisted flow through the real repository:
 *  - a normal duration is stored and read back;
 *  - the no-automatic-expiry marker (0) is stored and read back (allowed by
 *    migration 049);
 *  - revocation increments board_session_version (immediate revocation contract);
 *  - returning from no-expiry to a normal duration works.
 *
 * The JWT-level contract (0 -> 'unlimited' -> token without exp) is covered by
 * the pure unit test jwt.boardSession.test.ts; here we prove the persistence and
 * the revocation counter on a real database.
 */

import { Pool } from 'pg';
import runMigrations from '../../db/migrate';
import { hashAdminPassword } from '../../auth/bcrypt';
import {
  updateAppSettings,
  getAppSettingsById,
  incrementBoardSessionVersion,
} from '../../modules/adminCredentials/adminCredentials.repository';
import { withTransaction } from '../../db/transaction';

const DB_URL = process.env.DATABASE_URL!;

let pool: Pool;
let adminId: number;
const createdAdminIds: number[] = [];

beforeAll(async () => {
  pool = new Pool({ connectionString: DB_URL });
  await runMigrations();
  const passwordHash = await hashAdminPassword('board_session_settings_fixture_pw');
  const inserted = await pool.query<{ id: number }>(
    `INSERT INTO admin_accounts (username, password_hash)
     VALUES ($1, $2) RETURNING id`,
    ['board-session-settings-admin', passwordHash]
  );
  adminId = inserted.rows[0].id;
  createdAdminIds.push(adminId);
});

afterAll(async () => {
  if (createdAdminIds.length > 0) {
    await pool.query('DELETE FROM admin_accounts WHERE id = ANY($1)', [createdAdminIds]);
  }
  await pool.end();
});

async function boardVersion(): Promise<number> {
  const { rows } = await pool.query<{ board_session_version: number }>(
    'SELECT board_session_version FROM admin_accounts WHERE id = $1',
    [adminId]
  );
  return rows[0].board_session_version;
}

describe('cycle de vie des réglages de session Board (lot 3, PostgreSQL réel)', () => {
  it('mode durée normale : 12 est persisté et relu', async () => {
    await withTransaction((client) =>
      updateAppSettings(adminId, { board_session_ttl_hours: 12 }, client)
    );
    const settings = await getAppSettingsById(adminId);
    expect(settings.board_session_ttl_hours).toBe(12);
  });

  it('mode sans expiration automatique : 0 est persisté et relu', async () => {
    await withTransaction((client) =>
      updateAppSettings(adminId, { board_session_ttl_hours: 0 }, client)
    );
    const settings = await getAppSettingsById(adminId);
    expect(settings.board_session_ttl_hours).toBe(0);
  });

  it('révocation : board_session_version est incrémenté (révocation immédiate)', async () => {
    const before = await boardVersion();
    await withTransaction((client) => incrementBoardSessionVersion(adminId, client));
    const after = await boardVersion();
    expect(after).toBe(before + 1);
  });

  it('retour du mode sans expiration vers une durée normale : 24 est persisté', async () => {
    await withTransaction((client) =>
      updateAppSettings(adminId, { board_session_ttl_hours: 24 }, client)
    );
    const settings = await getAppSettingsById(adminId);
    expect(settings.board_session_ttl_hours).toBe(24);
  });
});
