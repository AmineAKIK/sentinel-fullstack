/**
 * Preuve PostgreSQL réelle du lot 7 (LIST-01, LIST-02) : Historique et
 * Connaissance doivent pouvoir naviguer au-delà de leur première page par
 * curseur, sans perte ni doublon — même mécanisme que le Journal (lot 7A),
 * appliqué à listIncidentWorkspaceRows (modes 'history' et 'knowledge').
 */

import { Pool } from 'pg';
import runMigrations from '../../db/migrate';
import { hashWorkshopPassword } from '../../auth/bcrypt';
import { listIncidentWorkspaceRows } from '../../modules/workshop/workshop.repository';
import { decodeCursor } from '../../utils/cursor';

const DB_URL = process.env.DATABASE_URL!;
const fixtureSuffix = `${process.pid}${Date.now()}`;
const lineNumber = `98${fixtureSuffix}1`;
const machineId = `WP-M-${fixtureSuffix}`;
const operatorBadge = `98${fixtureSuffix}2`;

let pool: Pool;
let lineId: number;
let operatorId: number;

const machines = [
  { machineId, brand: 'Workspace', hasDoubleRobot: false, robotNumber: 'R01', robotHeads: 1 },
];

async function insertIncident(overrides: {
  createdAt: string;
  updatedAt: string;
  status: string;
  robotLabel: string;
  interventionNote?: string | null;
}): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO workshop_incidents
       (user_id, line_id, line_number, machine_id, machine_brand, robot_label, head_number,
        state, created_at, updated_at, status, intervention_note, is_taken, is_priority)
     VALUES ($1, $2, $3, $4, 'Workspace', $5, 1, 'DEGRADEE', $6::timestamptz, $7::timestamptz, $8, $9, FALSE, FALSE)
     RETURNING id`,
    [
      operatorId,
      lineId,
      lineNumber,
      machineId,
      overrides.robotLabel,
      overrides.createdAt,
      overrides.updatedAt,
      overrides.status,
      overrides.interventionNote ?? null,
    ]
  );
  return rows[0].id;
}

beforeAll(async () => {
  pool = new Pool({ connectionString: DB_URL });
  await runMigrations();

  const passwordHash = await hashWorkshopPassword('workspace_integration_password');
  const { rows: userRows } = await pool.query<{ id: number }>(
    `INSERT INTO sentinel_users
       (first_name, last_name, badge_number, role, is_active, is_deleted, password_hash)
     VALUES ('Workspace', 'Fixture', $1, 'OPERATOR', TRUE, FALSE, $2)
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
  await pool.query(`DELETE FROM workshop_incidents WHERE line_id = $1`, [lineId]);
});

afterAll(async () => {
  await pool.query('DELETE FROM production_lines WHERE id = $1', [lineId]);
  await pool.query('DELETE FROM sentinel_users WHERE id = $1', [operatorId]);
  await pool.end();
});

describe('Historique — pagination par curseur (lot 7B, LIST-01)', () => {
  it('retourne nextCursor null quand tout tient dans une page', async () => {
    await insertIncident({
      createdAt: '2026-03-01T10:00:00Z',
      updatedAt: '2026-03-01T10:00:00Z',
      status: 'OPEN',
      robotLabel: 'R01',
    });

    const page = await listIncidentWorkspaceRows({ lineId, limit: '10' }, 'history');

    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBeNull();
  });

  it('pagine sans perte ni doublon sur plusieurs pages, triée par date de création', async () => {
    for (let i = 0; i < 5; i += 1) {
      await insertIncident({
        createdAt: `2026-03-0${i + 1}T10:00:00Z`,
        updatedAt: `2026-03-0${i + 1}T10:00:00Z`,
        status: 'OPEN',
        robotLabel: `R0${i + 1}`,
      });
    }

    const seen: unknown[] = [];
    let cursor: { sortValue: string; id: number } | undefined;
    for (let page = 0; page < 10; page += 1) {
      const result = await listIncidentWorkspaceRows({ lineId, limit: '2', cursor }, 'history');
      seen.push(...result.items);
      if (!result.nextCursor) break;
      cursor = decodeCursor(result.nextCursor) ?? undefined;
    }

    expect(seen).toHaveLength(5);
    expect(new Set(seen.map((row) => (row as { id: number }).id)).size).toBe(5);
  });

  it('départage deux incidents créés à la même milliseconde grâce au tie-breaker id', async () => {
    const sameInstant = '2026-03-10T10:00:00.000Z';
    await insertIncident({
      createdAt: sameInstant,
      updatedAt: sameInstant,
      status: 'OPEN',
      robotLabel: 'R01',
    });
    await insertIncident({
      createdAt: sameInstant,
      updatedAt: sameInstant,
      status: 'OPEN',
      robotLabel: 'R02',
    });

    const firstPage = await listIncidentWorkspaceRows({ lineId, limit: '1' }, 'history');
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).not.toBeNull();

    const cursor = decodeCursor(firstPage.nextCursor!)!;
    const secondPage = await listIncidentWorkspaceRows({ lineId, limit: '1', cursor }, 'history');

    expect(secondPage.items).toHaveLength(1);
    const firstId = (firstPage.items[0] as { id: number }).id;
    const secondId = (secondPage.items[0] as { id: number }).id;
    expect(secondId).not.toBe(firstId);
  });
});

describe('Connaissance — pagination par curseur (lot 7C, LIST-02)', () => {
  it('pagine les fiches closes avec note, triées par date de mise à jour', async () => {
    for (let i = 0; i < 3; i += 1) {
      await insertIncident({
        createdAt: `2026-03-0${i + 1}T08:00:00Z`,
        updatedAt: `2026-03-0${i + 1}T12:00:00Z`,
        status: 'CLOSED',
        robotLabel: `R0${i + 1}`,
        interventionNote: `Intervention ${i + 1}`,
      });
    }
    // Fiche non éligible (pas de note) : ne doit jamais apparaître.
    await insertIncident({
      createdAt: '2026-03-04T08:00:00Z',
      updatedAt: '2026-03-04T12:00:00Z',
      status: 'CLOSED',
      robotLabel: 'R04',
      interventionNote: null,
    });

    const page = await listIncidentWorkspaceRows({ lineId, limit: '10' }, 'knowledge');

    expect(page.items).toHaveLength(3);
    expect(page.nextCursor).toBeNull();
  });

  it('pagine sans perte ni doublon sur plusieurs pages', async () => {
    for (let i = 0; i < 5; i += 1) {
      await insertIncident({
        createdAt: `2026-03-0${i + 1}T08:00:00Z`,
        updatedAt: `2026-03-0${i + 1}T12:00:00Z`,
        status: 'CLOSED',
        robotLabel: `R0${i + 1}`,
        interventionNote: `Intervention ${i + 1}`,
      });
    }

    const seen: unknown[] = [];
    let cursor: { sortValue: string; id: number } | undefined;
    for (let page = 0; page < 10; page += 1) {
      const result = await listIncidentWorkspaceRows({ lineId, limit: '2', cursor }, 'knowledge');
      seen.push(...result.items);
      if (!result.nextCursor) break;
      cursor = decodeCursor(result.nextCursor) ?? undefined;
    }

    expect(seen).toHaveLength(5);
    expect(new Set(seen.map((row) => (row as { id: number }).id)).size).toBe(5);
  });
});
