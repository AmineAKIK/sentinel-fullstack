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
import { decodeCursor } from '../../utils/cursor';

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

    const page = await listHistoryEvents({
      lineId,
      start: '2026-03-01T00:00:00Z',
      end: '2026-03-31T23:59:59Z',
    });

    expect(page.items).toHaveLength(1);
    expect((page.items[0] as { event_type: string }).event_type).toBe('INCIDENT_CLOSED');
  });

  it('retourne tous les événements du périmètre quand aucune période n’est fournie', async () => {
    await insertEvent('INCIDENT_TAKEN', '2026-02-01T10:00:00Z');
    await insertEvent('INCIDENT_CLOSED', '2026-03-15T10:00:00Z');

    const page = await listHistoryEvents({ lineId });

    expect(page.items).toHaveLength(2);
  });

  it('combine le filtre période avec le filtre type d’événement existant', async () => {
    await insertEvent('INCIDENT_TAKEN', '2026-03-05T10:00:00Z');
    await insertEvent('INCIDENT_CLOSED', '2026-03-15T10:00:00Z');

    const page = await listHistoryEvents({
      lineId,
      eventType: 'INCIDENT_CLOSED',
      start: '2026-03-01T00:00:00Z',
      end: '2026-03-31T23:59:59Z',
    });

    expect(page.items).toHaveLength(1);
    expect((page.items[0] as { event_type: string }).event_type).toBe('INCIDENT_CLOSED');
  });
});

describe('journal — pagination par curseur (lot 7, LIST-03)', () => {
  it('retourne nextCursor null quand tout tient dans une page', async () => {
    await insertEvent('INCIDENT_TAKEN', '2026-03-01T10:00:00Z');
    await insertEvent('INCIDENT_CLOSED', '2026-03-02T10:00:00Z');

    const page = await listHistoryEvents({ lineId, limit: '10' });

    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
  });

  it('pagine sans perte ni doublon sur plusieurs pages', async () => {
    // 5 événements strictement ordonnés, page de taille 2 : doit produire
    // 3 pages (2, 2, 1) couvrant exactement les 5 événements, dans l'ordre.
    for (let i = 0; i < 5; i += 1) {
      await insertEvent('INCIDENT_TAKEN', `2026-03-0${i + 1}T10:00:00Z`);
    }

    const seen: unknown[] = [];
    let cursor: { sortValue: string; id: number } | undefined;
    for (let page = 0; page < 10; page += 1) {
      const result = await listHistoryEvents({ lineId, limit: '2', cursor });
      seen.push(...result.items);
      if (!result.nextCursor) break;
      cursor = decodeCursor(result.nextCursor) ?? undefined;
    }

    expect(seen).toHaveLength(5);
    const ids = seen.map((row) => (row as { id: number }).id);
    expect(new Set(ids).size).toBe(5);
  });

  it('départage deux événements à la même milliseconde grâce au tie-breaker id', async () => {
    const sameInstant = '2026-03-10T10:00:00.000Z';
    await insertEvent('INCIDENT_TAKEN', sameInstant);
    await insertEvent('INCIDENT_CLOSED', sameInstant);

    const firstPage = await listHistoryEvents({ lineId, limit: '1' });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).not.toBeNull();

    const cursor = decodeCursor(firstPage.nextCursor!)!;
    const secondPage = await listHistoryEvents({ lineId, limit: '1', cursor });

    expect(secondPage.items).toHaveLength(1);
    const firstId = (firstPage.items[0] as { id: number }).id;
    const secondId = (secondPage.items[0] as { id: number }).id;
    expect(secondId).not.toBe(firstId);
  });
});
