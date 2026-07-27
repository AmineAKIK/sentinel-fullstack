/**
 * Preuve PostgreSQL réelle du lot 7 (C-05), migration 050 : la mise en attente
 * devient un « motif de mise en attente » distinct du diagnostic.
 *
 * runMigrations() applique 001..050 sur une base vierge : on prouve d'abord que
 * la colonne waiting_reason existe. On prouve ensuite la transformation de
 * données du backfill en la rejouant sur des lignes de forme « ancienne »
 * (motif stocké dans diagnostic, waiting_reason NULL) : seuls les incidents
 * PENDING voient leur diagnostic recopié vers waiting_reason puis effacé ; les
 * incidents non PENDING ne sont pas touchés ; le flux applicatif écrit ensuite
 * waiting_reason et jamais diagnostic.
 */

import { Pool } from 'pg';
import runMigrations from '../../db/migrate';
import { hashWorkshopPassword } from '../../auth/bcrypt';
import { setPendingIncidentService } from '../../modules/workshop/workshop.service.mutations';

const DB_URL = process.env.DATABASE_URL!;
const fixtureSuffix = `${process.pid}${Date.now()}`;
const lineNumber = `66${fixtureSuffix}1`;
const operatorBadge = `66${fixtureSuffix}2`;
const maintenanceBadge = `66${fixtureSuffix}3`;
const machineFor = (slot: string) => `WR-M-${fixtureSuffix}-${slot}`;

let pool: Pool;
let lineId: number;
let operatorId: number;
let maintenanceId: number;

const machines = ['pending', 'open', 'flow'].map((slot) => ({
  machineId: machineFor(slot),
  brand: 'Waiting',
  hasDoubleRobot: false,
  robotNumber: 'R01',
  robotHeads: 1,
}));

// Insère un incident dans l'état « ancienne trace » : le motif de mise en
// attente est stocké dans diagnostic, waiting_reason est NULL (avant backfill).
async function insertLegacyIncident(
  slot: string,
  status: 'OPEN' | 'PENDING',
  diagnostic: string | null,
  taken = false
): Promise<number> {
  // chk_taken_consistency : is_taken=TRUE exige taken_by_user_id/taken_at.
  const takenBy = taken ? maintenanceId : null;
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO workshop_incidents
       (user_id, line_id, line_number, machine_id, machine_brand, robot_label, head_number,
        state, status, is_taken, is_priority, diagnostic, waiting_reason,
        taken_by_user_id, taken_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'Waiting', 'R01', 1, 'DEGRADEE', $5, $6, FALSE, $7, NULL,
             $8, ${taken ? 'NOW()' : 'NULL'}, NOW(), NOW())
     RETURNING id`,
    [operatorId, lineId, lineNumber, machineFor(slot), status, taken, diagnostic, takenBy]
  );
  return rows[0].id;
}

async function readReasons(
  incidentId: number
): Promise<{ diagnostic: string | null; waiting_reason: string | null; status: string }> {
  const { rows } = await pool.query<{
    diagnostic: string | null;
    waiting_reason: string | null;
    status: string;
  }>('SELECT diagnostic, waiting_reason, status FROM workshop_incidents WHERE id = $1', [
    incidentId,
  ]);
  return rows[0];
}

beforeAll(async () => {
  pool = new Pool({ connectionString: DB_URL });
  await runMigrations();

  const passwordHash = await hashWorkshopPassword('waiting_reason_password');
  const upsertUser = async (badge: string, role: string): Promise<number> => {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO sentinel_users
         (first_name, last_name, badge_number, role, is_active, is_deleted, password_hash)
       VALUES ('Waiting', 'Fixture', $1, $2, TRUE, FALSE, $3)
       RETURNING id`,
      [badge, role, passwordHash]
    );
    return rows[0].id;
  };
  operatorId = await upsertUser(operatorBadge, 'OPERATOR');
  maintenanceId = await upsertUser(maintenanceBadge, 'MAINTENANCE');

  const { rows: lineRows } = await pool.query<{ id: number }>(
    `INSERT INTO production_lines (line_number, machine_sequence, is_active, is_deleted)
     VALUES ($1, $2::jsonb, TRUE, FALSE)
     RETURNING id`,
    [lineNumber, JSON.stringify(machines)]
  );
  lineId = lineRows[0].id;
}, 30_000);

async function purge(): Promise<void> {
  const sel = 'SELECT id FROM workshop_incidents WHERE line_id = $1';
  await pool.query(`DELETE FROM workshop_incident_events WHERE incident_id IN (${sel})`, [lineId]);
  await pool.query('DELETE FROM workshop_incidents WHERE line_id = $1', [lineId]);
}

afterEach(purge);

afterAll(async () => {
  await purge();
  await pool.query('DELETE FROM production_lines WHERE id = $1', [lineId]);
  await pool.query('DELETE FROM sentinel_users WHERE id = ANY($1)', [[operatorId, maintenanceId]]);
  await pool.end();
});

// La transformation de données de la migration 050, rejouée à l'identique.
async function replayBackfill(): Promise<void> {
  await pool.query(
    `UPDATE workshop_incidents
     SET waiting_reason = diagnostic, diagnostic = NULL
     WHERE status = 'PENDING'
       AND diagnostic IS NOT NULL
       AND waiting_reason IS NULL`
  );
}

describe('migration 050 — waiting_reason distinct du diagnostic (lot 7, C-05)', () => {
  it('la colonne waiting_reason existe après migration d’une base vierge', async () => {
    const { rows } = await pool.query<{ data_type: string }>(
      `SELECT data_type FROM information_schema.columns
       WHERE table_name = 'workshop_incidents' AND column_name = 'waiting_reason'`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].data_type).toBe('text');
  });

  it('le backfill recopie le motif des seuls incidents PENDING puis efface diagnostic', async () => {
    // Un incident PENDING doit être pris (chk_pending_must_be_taken).
    const pendingId = await insertLegacyIncident('pending', 'PENDING', 'Attente pièce', true);
    const openId = await insertLegacyIncident('open', 'OPEN', 'Vrai diagnostic maintenance');

    await replayBackfill();

    const pending = await readReasons(pendingId);
    expect(pending.waiting_reason).toBe('Attente pièce');
    // L'ancien motif n'est plus présenté comme un diagnostic.
    expect(pending.diagnostic).toBeNull();

    // Un incident non PENDING n'est pas touché par le backfill.
    const open = await readReasons(openId);
    expect(open.waiting_reason).toBeNull();
    expect(open.diagnostic).toBe('Vrai diagnostic maintenance');
  });

  it('une nouvelle mise en attente écrit waiting_reason et jamais diagnostic', async () => {
    const incidentId = await insertLegacyIncident('flow', 'OPEN', null, true);

    const result = await setPendingIncidentService(
      incidentId,
      'Ligne à l’arrêt',
      maintenanceId,
      'MAINTENANCE'
    );
    expect(result.ok).toBe(true);

    const after = await readReasons(incidentId);
    expect(after.status).toBe('PENDING');
    expect(after.waiting_reason).toBe('Ligne à l’arrêt');
    expect(after.diagnostic).toBeNull();
  });
});
