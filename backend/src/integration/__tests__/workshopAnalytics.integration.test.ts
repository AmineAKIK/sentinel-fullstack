/**
 * Preuves PostgreSQL réelles du lot 6 (ANA-04) : la cohorte « clôturés sur la
 * période » doit être indépendante de la cohorte « créés sur la période »
 * (DR-09). Un incident créé avant la fenêtre mais clôturé pendant doit
 * compter dans closed_count sans jamais y être créé.
 */

import { Pool } from 'pg';
import runMigrations from '../../db/migrate';
import { hashWorkshopPassword } from '../../auth/bcrypt';
import { getWorkshopAnalytics } from '../../modules/workshop/workshop.repository.analytics';

const DB_URL = process.env.DATABASE_URL!;
const fixtureSuffix = `${process.pid}${Date.now()}`;
const lineNumber = `96${fixtureSuffix}1`;
const machineId = `AN-M-${fixtureSuffix}`;
const operatorBadge = `96${fixtureSuffix}2`;

let pool: Pool;
let lineId: number;
let operatorId: number;

const machines = [
  { machineId, brand: 'Analytics', hasDoubleRobot: false, robotNumber: 'R01', robotHeads: 1 },
];

async function insertIncident(overrides: {
  createdAt: string;
  status: string;
  robotLabel: string;
}): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO workshop_incidents
       (user_id, line_id, line_number, machine_id, machine_brand, robot_label, head_number,
        state, created_at, status, is_taken, is_priority, updated_at)
     VALUES ($1, $2, $3, $4, 'Analytics', $5, 1, 'DEGRADEE', $6::timestamptz, $7, FALSE, FALSE, $6::timestamptz)
     RETURNING id`,
    [
      operatorId,
      lineId,
      lineNumber,
      machineId,
      overrides.robotLabel,
      overrides.createdAt,
      overrides.status,
    ]
  );
  return rows[0].id;
}

async function insertClosedEvent(incidentId: number, closedAt: string): Promise<void> {
  await pool.query(
    `INSERT INTO workshop_incident_events
       (incident_id, actor_user_id, event_type, created_at, actor_kind)
     VALUES ($1, $2, 'INCIDENT_CLOSED', $3::timestamptz, 'WORKSHOP_USER')`,
    [incidentId, operatorId, closedAt]
  );
}

beforeAll(async () => {
  pool = new Pool({ connectionString: DB_URL });
  await runMigrations();

  const passwordHash = await hashWorkshopPassword('analytics_integration_password');
  const { rows: userRows } = await pool.query<{ id: number }>(
    `INSERT INTO sentinel_users
       (first_name, last_name, badge_number, role, is_active, is_deleted, password_hash)
     VALUES ('Analytics', 'Fixture', $1, 'OPERATOR', TRUE, FALSE, $2)
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
}, 30_000);

afterEach(async () => {
  await pool.query(
    `DELETE FROM workshop_incident_events WHERE incident_id IN (SELECT id FROM workshop_incidents WHERE line_id = $1)`,
    [lineId]
  );
  await pool.query(`DELETE FROM workshop_incidents WHERE line_id = $1`, [lineId]);
});

afterAll(async () => {
  await pool.query('DELETE FROM production_lines WHERE id = $1', [lineId]);
  await pool.query('DELETE FROM sentinel_users WHERE id = $1', [operatorId]);
  await pool.end();
});

describe('analytics — cohortes créés / clôturés (lot 6, ANA-04, DR-09)', () => {
  it('compte un incident clôturé pendant la fenêtre même si sa création est antérieure', async () => {
    // Créé bien avant la fenêtre analysée, clôturé pendant la fenêtre.
    const incidentId = await insertIncident({
      createdAt: '2026-01-01T08:00:00Z',
      status: 'CLOSED',
      robotLabel: 'R01',
    });
    await insertClosedEvent(incidentId, '2026-03-15T10:00:00Z');

    const result = await getWorkshopAnalytics({
      start: '2026-03-01T00:00:00Z',
      end: '2026-03-31T23:59:59Z',
      lineId,
    });

    // DR-09 : la cohorte « clôturés sur la période » est indépendante de la
    // cohorte « créés sur la période ». Cet incident n'a pas été créé dans la
    // fenêtre (created_count doit rester 0) mais a bien été clôturé dedans
    // (closed_count doit valoir 1).
    expect(result.created).toBe(0);
    expect(result.closed).toBe(1);
  });

  it('ne compte pas un incident créé dans la fenêtre mais clôturé après', async () => {
    const incidentId = await insertIncident({
      createdAt: '2026-03-10T08:00:00Z',
      status: 'CLOSED',
      robotLabel: 'R01',
    });
    await insertClosedEvent(incidentId, '2026-04-05T10:00:00Z');

    const result = await getWorkshopAnalytics({
      start: '2026-03-01T00:00:00Z',
      end: '2026-03-31T23:59:59Z',
      lineId,
    });

    expect(result.created).toBe(1);
    expect(result.closed).toBe(0);
  });

  it('reflète les deux cohortes dans la tendance journalière (trend[])', async () => {
    const oldIncident = await insertIncident({
      createdAt: '2026-01-01T08:00:00Z',
      status: 'CLOSED',
      robotLabel: 'R01',
    });
    await insertClosedEvent(oldIncident, '2026-03-15T10:00:00Z');

    const result = await getWorkshopAnalytics({
      start: '2026-03-01T00:00:00Z',
      end: '2026-03-31T23:59:59Z',
      lineId,
    });

    const day = result.trend.find((row: { day: string }) => row.day === '2026-03-15');
    expect(day).toBeDefined();
    expect(day?.created).toBe(0);
    expect(day?.closed).toBe(1);
  });

  it('regroupe la tendance journalière par jour Europe/Paris, pas par jour UTC (DR-10)', async () => {
    // 23:30 UTC le 15 janvier = 00:30 heure de Paris le 16 janvier (hiver,
    // UTC+1). Si le bornage utilisait UTC, cet incident apparaîtrait le 15.
    const incidentId = await insertIncident({
      createdAt: '2026-01-15T23:30:00Z',
      status: 'OPEN',
      robotLabel: 'R01',
    });

    const result = await getWorkshopAnalytics({
      start: '2026-01-01T00:00:00Z',
      end: '2026-01-31T23:59:59Z',
      lineId,
    });

    const day15 = result.trend.find((row: { day: string }) => row.day === '2026-01-15');
    const day16 = result.trend.find((row: { day: string }) => row.day === '2026-01-16');
    expect(day15).toBeUndefined();
    expect(day16?.created).toBe(1);

    await pool.query('DELETE FROM workshop_incidents WHERE id = $1', [incidentId]);
  });

  it('produit un résultat cohérent sans explosion de lignes sur un volume réaliste (ANA-06)', async () => {
    // Plusieurs dizaines d'incidents répartis sur plusieurs jours : le plan
    // cartésien day_keys × filtered_incidents doit rester correct même quand
    // les deux tables ont plusieurs lignes chacune.
    const days = ['2026-03-01', '2026-03-02', '2026-03-03'];
    for (const day of days) {
      for (let i = 0; i < 5; i += 1) {
        const incidentId = await insertIncident({
          createdAt: `${day}T0${i}:00:00Z`,
          status: 'CLOSED',
          robotLabel: 'R01',
        });
        await insertClosedEvent(incidentId, `${day}T1${i}:00:00Z`);
      }
    }

    const result = await getWorkshopAnalytics({
      start: '2026-03-01T00:00:00Z',
      end: '2026-03-31T23:59:59Z',
      lineId,
    });

    expect(result.created).toBe(15);
    expect(result.closed).toBe(15);
    for (const day of days) {
      const row = result.trend.find((entry: { day: string }) => entry.day === day);
      expect(row?.created).toBe(5);
      expect(row?.closed).toBe(5);
    }
  });
});
