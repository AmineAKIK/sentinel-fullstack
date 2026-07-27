/**
 * Integration test for migration 049 (RC3, lot 3), against a real PostgreSQL
 * database provisioned by the CI "Backend / PostgreSQL integration" job.
 *
 * It proves the relaxed CHECK constraint on admin_accounts.board_session_ttl_hours:
 *  - 0 (internal "no automatic expiry" marker) is now ACCEPTED;
 *  - the normal range 1..168 is still accepted;
 *  - out-of-range values (-1, 169, 200) are still rejected by the constraint.
 *
 * runMigrations() applies every migration 001..049 in order, so this also
 * exercises the append-only upgrade path (previous migrations, including 041 that
 * created the original 1..168 constraint, are untouched).
 */

import { Pool } from 'pg';
import runMigrations from '../../db/migrate';
import { hashAdminPassword } from '../../auth/bcrypt';

const DB_URL = process.env.DATABASE_URL!;

let pool: Pool;
let adminId: number;
const createdAdminIds: number[] = [];

beforeAll(async () => {
  pool = new Pool({ connectionString: DB_URL });
  await runMigrations();
  const passwordHash = await hashAdminPassword('board_session_migration_fixture_pw');
  const inserted = await pool.query<{ id: number }>(
    `INSERT INTO admin_accounts (username, password_hash)
     VALUES ($1, $2)
     RETURNING id`,
    ['board-session-migration-admin', passwordHash]
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

async function setBoardTtl(value: number): Promise<void> {
  await pool.query('UPDATE admin_accounts SET board_session_ttl_hours = $1 WHERE id = $2', [
    value,
    adminId,
  ]);
}

describe('migration 049 — board_session_ttl_hours constraint (lot 3)', () => {
  it('ROUGE : le contrat RC2 (contrainte 1..168) refuse la valeur 0', async () => {
    // Reproduit la contrainte d'origine (migration 041) pour prouver, dans le
    // même environnement, que 0 était bien refusé AVANT 049. Tout se fait sur UN
    // client réservé (les tables temporaires sont liées à une connexion).
    const client = await pool.connect();
    try {
      await client.query(
        'CREATE TEMPORARY TABLE rc2_board_probe (v integer NOT NULL DEFAULT 12 CHECK (v BETWEEN 1 AND 168))'
      );
      await expect(client.query('INSERT INTO rc2_board_probe (v) VALUES (0)')).rejects.toThrow(
        /rc2_board_probe|check constraint/i
      );
    } finally {
      client.release();
    }
  });

  it('accepte 0 (sans expiration automatique)', async () => {
    await expect(setBoardTtl(0)).resolves.not.toThrow();
    const { rows } = await pool.query(
      'SELECT board_session_ttl_hours FROM admin_accounts WHERE id = $1',
      [adminId]
    );
    expect(rows[0].board_session_ttl_hours).toBe(0);
  });

  it('accepte les bornes normales 1 et 168', async () => {
    await expect(setBoardTtl(1)).resolves.not.toThrow();
    await expect(setBoardTtl(168)).resolves.not.toThrow();
  });

  it('rejette les valeurs hors plage (-1, 169, 200)', async () => {
    for (const bad of [-1, 169, 200]) {
      await expect(setBoardTtl(bad)).rejects.toThrow(
        /chk_board_session_duration|check constraint/i
      );
    }
  });
});
