/**
 * Preuve PostgreSQL réelle du lot 7D (LIST-04, DR-12) : la projection active
 * du Dashboard reste toujours complète (aucune borne, aucun suivi résolu
 * mélangé dedans), et les suivis résolus sont chargés séparément, paginés
 * par curseur.
 */

import { Pool } from 'pg';
import runMigrations from '../../db/migrate';
import { hashWorkshopPassword } from '../../auth/bcrypt';
import {
  listFollowedResolvedIncidents,
  listIncidents,
} from '../../modules/workshop/workshop.repository';
import { decodeCursor } from '../../utils/cursor';

const DB_URL = process.env.DATABASE_URL!;
const fixtureSuffix = `${process.pid}${Date.now()}`;
const lineNumber = `99${fixtureSuffix}1`;
const machineId = `FR-M-${fixtureSuffix}`;
const operatorBadge = `99${fixtureSuffix}2`;

let pool: Pool;
let lineId: number;
let operatorId: number;

const machines = [
  { machineId, brand: 'Followed', hasDoubleRobot: false, robotNumber: 'R01', robotHeads: 1 },
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
     VALUES ($1, $2, $3, $4, 'Followed', $5, 1, 'DEGRADEE', $6::timestamptz, $7, FALSE, FALSE, $6::timestamptz)
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

async function follow(incidentId: number): Promise<void> {
  await pool.query(
    `INSERT INTO workshop_incident_followers (incident_id, user_id) VALUES ($1, $2)`,
    [incidentId, operatorId]
  );
}

beforeAll(async () => {
  pool = new Pool({ connectionString: DB_URL });
  await runMigrations();

  const passwordHash = await hashWorkshopPassword('followed_integration_password');
  const { rows: userRows } = await pool.query<{ id: number }>(
    `INSERT INTO sentinel_users
       (first_name, last_name, badge_number, role, is_active, is_deleted, password_hash)
     VALUES ('Followed', 'Fixture', $1, 'RESPONSABLE', TRUE, FALSE, $2)
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
    `DELETE FROM workshop_incident_followers WHERE incident_id IN (SELECT id FROM workshop_incidents WHERE line_id = $1)`,
    [lineId]
  );
  await pool.query(`DELETE FROM workshop_incidents WHERE line_id = $1`, [lineId]);
});

afterAll(async () => {
  await pool.query('DELETE FROM production_lines WHERE id = $1', [lineId]);
  await pool.query('DELETE FROM sentinel_users WHERE id = $1', [operatorId]);
  await pool.end();
});

describe('Dashboard — projection active complète (lot 7D, LIST-04, DR-12)', () => {
  it('listIncidents ne retourne jamais un suivi résolu, même suivi', async () => {
    const activeId = await insertIncident({
      createdAt: '2026-03-01T10:00:00Z',
      status: 'OPEN',
      robotLabel: 'R01',
    });
    const resolvedId = await insertIncident({
      createdAt: '2026-03-02T10:00:00Z',
      status: 'CLOSED',
      robotLabel: 'R02',
    });
    await follow(resolvedId);

    const rows = await listIncidents(operatorId);

    const ids = rows.map((row: { id: number }) => row.id);
    expect(ids).toContain(activeId);
    expect(ids).not.toContain(resolvedId);
  });

  it('listIncidents retourne tous les actifs sans borne, quel que soit leur nombre', async () => {
    const ids: number[] = [];
    for (let i = 0; i < 10; i += 1) {
      ids.push(
        await insertIncident({
          createdAt: `2026-03-0${(i % 9) + 1}T10:00:00Z`,
          status: 'OPEN',
          robotLabel: `R0${i}`,
        })
      );
    }

    const rows = await listIncidents(operatorId);

    const returnedIds = rows.map((row: { id: number }) => row.id);
    for (const id of ids) expect(returnedIds).toContain(id);
  });
});

describe('Dashboard — suivis résolus paginés (lot 7D, LIST-04)', () => {
  it('ne retourne que les suivis terminaux suivis par cet utilisateur', async () => {
    const activeFollowedId = await insertIncident({
      createdAt: '2026-03-01T10:00:00Z',
      status: 'OPEN',
      robotLabel: 'R01',
    });
    await follow(activeFollowedId);
    const resolvedFollowedId = await insertIncident({
      createdAt: '2026-03-02T10:00:00Z',
      status: 'CLOSED',
      robotLabel: 'R02',
    });
    await follow(resolvedFollowedId);
    const resolvedNotFollowedId = await insertIncident({
      createdAt: '2026-03-03T10:00:00Z',
      status: 'CLOSED',
      robotLabel: 'R03',
    });
    void resolvedNotFollowedId;

    const page = await listFollowedResolvedIncidents(operatorId, { limit: '10' });

    const ids = page.items.map((row) => (row as { id: number }).id);
    expect(ids).toEqual([resolvedFollowedId]);
  });

  it('pagine sans perte ni doublon sur plusieurs pages', async () => {
    const ids: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const id = await insertIncident({
        createdAt: `2026-03-0${i + 1}T10:00:00Z`,
        status: 'CLOSED',
        robotLabel: `R0${i}`,
      });
      await follow(id);
      ids.push(id);
    }

    const seen: unknown[] = [];
    let cursor: { sortValue: string; id: number } | undefined;
    for (let page = 0; page < 10; page += 1) {
      const result = await listFollowedResolvedIncidents(operatorId, { limit: '2', cursor });
      seen.push(...result.items);
      if (!result.nextCursor) break;
      cursor = decodeCursor(result.nextCursor) ?? undefined;
    }

    expect(seen).toHaveLength(5);
    expect(new Set(seen.map((row) => (row as { id: number }).id)).size).toBe(5);
  });
});
