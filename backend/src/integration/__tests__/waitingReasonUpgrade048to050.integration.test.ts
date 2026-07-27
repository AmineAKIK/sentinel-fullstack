/**
 * Preuve PostgreSQL réelle du lot 11 (C-05) : montée « 048 → 050 » depuis une
 * base RÉELLEMENT figée à la migration 048, distincte de la validation
 * base-vierge « 001 → 050 » (déjà faite au lot 7).
 *
 * Le test applique lui-même, dans un SCHÉMA dédié, les migrations 001..048 dans
 * l'ordre (état d'avant RC3), insère un incident PENDING « ancienne forme »
 * (motif dans diagnostic, pas de colonne waiting_reason), PUIS applique 049 et
 * 050 et vérifie que le backfill a bien transformé les données. Le schéma dédié
 * isole ce test du schéma `public` que runMigrations remplit pour les autres
 * suites d'intégration.
 */

import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { Pool } from 'pg';

const DB_URL = process.env.DATABASE_URL!;
const SCHEMA = `rc3_upgrade_${process.pid}`;
const MIGRATIONS_DIR = path.join(__dirname, '../../../migrations');
const REPO_ROOT = path.join(__dirname, '../../../..');
// Réf. RC2 figée : la branche de stabilisation rc.2. La montée testée part donc
// littéralement des migrations RC2 (001..048), pas d'une copie approximative.
const RC2_REF = 'release/v1.0.0-rc2';

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

// Contenu d'un fichier de migration tel qu'il existe dans la réf. RC2 figée.
function rc2MigrationSql(file: string): string | null {
  try {
    return execFileSync('git', ['show', `${RC2_REF}:backend/migrations/${file}`], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
  } catch {
    return null;
  }
}

let pool: Pool;

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{3}_.*\.sql$/.test(f))
    .sort();
}

function migrationSql(file: string): string {
  return readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
}

// Applique une migration dans le schéma dédié : on force search_path pour que
// les tables non qualifiées soient créées et modifiées dans ce schéma.
async function applyMigration(file: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`SET search_path TO ${SCHEMA}, public`);
    await client.query('BEGIN');
    await client.query(migrationSql(file));
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    // `cause` attaché explicitement (préserve l'erreur d'origine) sans dépendre
    // de la lib ES2022 du constructeur Error.
    throw Object.assign(new Error(`Échec migration ${file} : ${String(err)}`), { cause: err });
  } finally {
    client.release();
  }
}

beforeAll(async () => {
  pool = new Pool({ connectionString: DB_URL });
  await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await pool.query(`CREATE SCHEMA ${SCHEMA}`);
}, 60_000);

afterAll(async () => {
  await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await pool.end();
});

describe('montée 048 → 049 → 050 depuis la fixture RC2 figée (lot 11, C-05)', () => {
  it('les migrations 001..048 appliquées SONT celles de la RC2 figée (byte-identiques)', () => {
    const upTo048 = migrationFiles().filter((f) => Number(f.slice(0, 3)) <= 48);
    expect(upTo048.length).toBe(48);
    // Chaque fichier 001..048 utilisé pour bâtir la base est identique, au bit
    // près, à son homologue de la réf. RC2 — la « base figée à 048 » est donc
    // exactement l'état RC2, pas une reconstruction approximative.
    for (const file of upTo048) {
      const rc2 = rc2MigrationSql(file);
      // Chaque migration 001..048 doit exister dans la réf. RC2…
      expect(rc2).not.toBeNull();
      // …et être identique au bit près à celle appliquée par le test.
      expect(sha256(migrationSql(file))).toBe(sha256(rc2 as string));
    }
  });

  it('applique 001..048, seed ancienne forme, puis 049 puis 050 et backfill le motif', async () => {
    const files = migrationFiles();
    const upTo048 = files.filter((f) => Number(f.slice(0, 3)) <= 48);
    const has049 = files.includes('049_allow_board_session_without_automatic_expiry.sql');
    const has050 = files.includes('050_model_waiting_reason_separately_from_diagnostic.sql');
    expect(has049 && has050).toBe(true);
    expect(upTo048.length).toBe(48);

    // 1. État figé à 048 (fixture RC2).
    for (const file of upTo048) {
      await applyMigration(file);
    }

    // Avant 050, la colonne waiting_reason n'existe pas encore.
    const beforeCol = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'workshop_incidents'
         AND column_name = 'waiting_reason'`,
      [SCHEMA]
    );
    expect(beforeCol.rows).toHaveLength(0);

    // 2. Seed « ancienne forme » : une ligne, une machine, un opérateur, un
    //    incident PENDING dont le motif de mise en attente est dans diagnostic.
    await pool.query(`SET search_path TO ${SCHEMA}, public`);
    const { rows: userRows } = await pool.query<{ id: number }>(
      `INSERT INTO ${SCHEMA}.sentinel_users
         (first_name, last_name, badge_number, role, is_active, is_deleted, password_hash)
       VALUES ('Up', 'Grade', '480500001', 'OPERATOR', TRUE, FALSE, 'x')
       RETURNING id`
    );
    const operatorId = userRows[0].id;
    const machines = JSON.stringify([
      {
        machineId: 'UP-M-1',
        brand: 'Up',
        hasDoubleRobot: false,
        robotNumber: 'R01',
        robotHeads: 1,
      },
    ]);
    const { rows: lineRows } = await pool.query<{ id: number }>(
      `INSERT INTO ${SCHEMA}.production_lines (line_number, machine_sequence, is_active, is_deleted)
       VALUES ('48050', $1::jsonb, TRUE, FALSE) RETURNING id`,
      [machines]
    );
    const lineId = lineRows[0].id;
    const { rows: incidentRows } = await pool.query<{ id: number }>(
      `INSERT INTO ${SCHEMA}.workshop_incidents
         (user_id, line_id, line_number, machine_id, machine_brand, robot_label, head_number,
          state, status, is_taken, is_priority, diagnostic, taken_by_user_id, taken_at,
          created_at, updated_at)
       VALUES ($1, $2, '48050', 'UP-M-1', 'Up', 'R01', 1, 'DEGRADEE', 'PENDING', TRUE, FALSE,
               'Attente pièce (ancienne trace)', $1, NOW(), NOW(), NOW())
       RETURNING id`,
      [operatorId, lineId]
    );
    const incidentId = incidentRows[0].id;

    // 3. Montée 049 puis 050.
    await applyMigration('049_allow_board_session_without_automatic_expiry.sql');
    await applyMigration('050_model_waiting_reason_separately_from_diagnostic.sql');

    // 4. Post-conditions : le motif est passé dans waiting_reason, diagnostic
    //    est effacé pour cet incident PENDING.
    const { rows } = await pool.query<{ diagnostic: string | null; waiting_reason: string | null }>(
      `SELECT diagnostic, waiting_reason FROM ${SCHEMA}.workshop_incidents WHERE id = $1`,
      [incidentId]
    );
    expect(rows[0].waiting_reason).toBe('Attente pièce (ancienne trace)');
    expect(rows[0].diagnostic).toBeNull();
  }, 60_000);
});
