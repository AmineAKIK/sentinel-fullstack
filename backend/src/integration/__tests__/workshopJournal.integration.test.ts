/**
 * Preuve PostgreSQL réelle du lot 6 (ANA-03) : le Journal doit pouvoir être
 * filtré par période, comme promis par le cadrage fonctionnel — le filtre
 * porte sur la date de l'événement (we.created_at), pas sur la date de
 * création de l'incident concerné.
 */

import { Pool } from 'pg';
import runMigrations from '../../db/migrate';
import { hashWorkshopPassword } from '../../auth/bcrypt';
import { listHistoryEvents } from '../../modules/workshop/workshop.repository';

const DB_URL = process.env.DATABASE_URL!;
const fixtureSuffix = `${process.pid}${Date.now()}`;
const lineNumber = `97${fixtureSuffix}1`;
const machineId = `JR-M-${fixtureSuffix}`;
const operatorBadge = `97${fixtureSuffix}2`;

let pool: Pool;
let lineId: number;
let operatorId: number;
let incidentId: number;

const machines = [
  { machineId, brand: 'Journal', hasDoubleRobot: false, robotNumber: 'R01', robotHeads: 1 },
];

async function insertEvent(eventType: string, createdAt: string): Promise<void> {
  await pool.query(
    `INSERT INTO workshop_incident_events
       (incident_id, actor_user_id, event_type, created_at, actor_kind)
     VALUES ($1, $2, $3, $4::timestamptz, 'WORKSHOP_USER')`,
    [incidentId, operatorId, eventType, createdAt]
  );
}

beforeAll(async () => {
  pool = new Pool({ connectionString: DB_URL });
  await runMigrations();

  const passwordHash = await hashWorkshopPassword('journal_integration_password');
  const { rows: userRows } = await pool.query<{ id: number }>(
    `INSERT INTO sentinel_users
       (first_name, last_name, badge_number, role, is_active, is_deleted, password_hash)
     VALUES ('Journal', 'Fixture', $1, 'OPERATOR', TRUE, FALSE, $2)
     RETURNING id`,
    [operatorBadge, passwordHash]
  );
  operatorId = userRows[0].id;

  const { rows: lineRows } = await pool.query<{ id: number }>(
    `INSERT INTO production_lines (line_number, machine_sequence, is_active, is_deleted)
     VALUES ($1, $2::jsonb, TRUE, FALSE)
     RETURNING id`,
    [lineNumber, JSON.stringify(machines)]
  );
  lineId = lineRows[0].id;

  const { rows: incidentRows } = await pool.query<{ id: number }>(
    `INSERT INTO workshop_incidents
       (user_id, line_id, line_number, machine_id, machine_brand, robot_label, head_number,
        state, created_at, status, is_taken, is_priority, updated_at)
     VALUES ($1, $2, $3, $4, 'Journal', 'R01', 1, 'DEGRADEE', '2026-01-01T08:00:00Z', 'OPEN', FALSE, FALSE, NOW())
     RETURNING id`,
    [operatorId, lineId, lineNumber, machineId]
  );
  incidentId = incidentRows[0].id;
}, 30_000);

afterEach(async () => {
  await pool.query('DELETE FROM workshop_incident_events WHERE incident_id = $1', [incidentId]);
});

afterAll(async () => {
  await pool.query('DELETE FROM workshop_incidents WHERE id = $1', [incidentId]);
  await pool.query('DELETE FROM production_lines WHERE id = $1', [lineId]);
  await pool.query('DELETE FROM sentinel_users WHERE id = $1', [operatorId]);
  await pool.end();
});

describe('journal — filtre par période (lot 6, ANA-03)', () => {
  it('ne retient que les événements dont la date tombe dans la fenêtre demandée', async () => {
    await insertEvent('INCIDENT_TAKEN', '2026-02-01T10:00:00Z');
    await insertEvent('INCIDENT_CLOSED', '2026-03-15T10:00:00Z');
    await insertEvent('INCIDENT_CANCELED', '2026-04-01T10:00:00Z');

    const rows = await listHistoryEvents({
      lineId,
      start: '2026-03-01T00:00:00Z',
      end: '2026-03-31T23:59:59Z',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].event_type).toBe('INCIDENT_CLOSED');
  });

  it('retourne tous les événements du périmètre quand aucune période n’est fournie', async () => {
    await insertEvent('INCIDENT_TAKEN', '2026-02-01T10:00:00Z');
    await insertEvent('INCIDENT_CLOSED', '2026-03-15T10:00:00Z');

    const rows = await listHistoryEvents({ lineId });

    expect(rows).toHaveLength(2);
  });

  it('combine le filtre période avec le filtre type d’événement existant', async () => {
    await insertEvent('INCIDENT_TAKEN', '2026-03-05T10:00:00Z');
    await insertEvent('INCIDENT_CLOSED', '2026-03-15T10:00:00Z');

    const rows = await listHistoryEvents({
      lineId,
      eventType: 'INCIDENT_CLOSED',
      start: '2026-03-01T00:00:00Z',
      end: '2026-03-31T23:59:59Z',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].event_type).toBe('INCIDENT_CLOSED');
  });
});
