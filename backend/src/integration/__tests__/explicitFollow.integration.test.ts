/**
 * Preuve PostgreSQL réelle du lot 6 (C-07) : le suivi (l'étoile) est le SEUL
 * opt-in explicite. Agir sur un incident (prioriser, consigner, arbitrer,
 * annuler…) n'ajoute JAMAIS le responsable à la table des suiveurs, et un suivi
 * explicite préexistant n'est ni supprimé ni dupliqué lorsque le responsable
 * agit ensuite.
 */

import { Pool } from 'pg';
import runMigrations from '../../db/migrate';
import { hashWorkshopPassword } from '../../auth/bcrypt';
import { createIncidentService } from '../../modules/workshop/workshop.service.edit';
import {
  setPriorityIncidentService,
  setResponsibleCommentService,
  followIncidentService,
} from '../../modules/workshop/workshop.service.mutations';

const DB_URL = process.env.DATABASE_URL!;
const fixtureSuffix = `${process.pid}${Date.now()}`;
const lineNumber = `77${fixtureSuffix}1`;
const machineId = `FOL-M-${fixtureSuffix}`;
const operatorBadge = `77${fixtureSuffix}2`;
const responsableBadge = `77${fixtureSuffix}3`;

let pool: Pool;
let lineId: number;
let operatorId: number;
let responsableId: number;

const machines = [
  { machineId, brand: 'Follow', hasDoubleRobot: false, robotNumber: 'R01', robotHeads: 1 },
];

function assertOk<T extends { ok: boolean }>(result: T): T {
  if (!result.ok) throw new Error(`Expected ok but got: ${JSON.stringify(result)}`);
  return result;
}

async function activeFollowerCount(incidentId: number, userId: number): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM workshop_incident_followers
     WHERE incident_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [incidentId, userId]
  );
  return Number(rows[0].count);
}

async function createIncident(): Promise<number> {
  const created = assertOk(
    await createIncidentService(
      {
        lineId,
        machineId,
        robotLabel: 'R01',
        headNumber: 1,
        state: 'DEGRADEE',
        currentProduct: 'REF-F',
      },
      operatorId,
      'OPERATOR'
    )
  ) as { data: { id: number } };
  return created.data.id;
}

beforeAll(async () => {
  pool = new Pool({ connectionString: DB_URL });
  await runMigrations();

  const passwordHash = await hashWorkshopPassword('explicit_follow_password');
  const upsertUser = async (badge: string, role: string): Promise<number> => {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO sentinel_users
         (first_name, last_name, badge_number, role, is_active, is_deleted, password_hash)
       VALUES ('Follow', 'Fixture', $1, $2, TRUE, FALSE, $3)
       RETURNING id`,
      [badge, role, passwordHash]
    );
    return rows[0].id;
  };
  operatorId = await upsertUser(operatorBadge, 'OPERATOR');
  responsableId = await upsertUser(responsableBadge, 'RESPONSABLE');

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
  await pool.query(`DELETE FROM workshop_incident_followers WHERE incident_id IN (${sel})`, [
    lineId,
  ]);
  await pool.query(`DELETE FROM workshop_incident_events WHERE incident_id IN (${sel})`, [lineId]);
  await pool.query('DELETE FROM workshop_incidents WHERE line_id = $1', [lineId]);
}

afterEach(purge);

afterAll(async () => {
  await purge();
  await pool.query('DELETE FROM production_lines WHERE id = $1', [lineId]);
  await pool.query('DELETE FROM sentinel_users WHERE id = ANY($1)', [[operatorId, responsableId]]);
  await pool.end();
});

describe('suivi explicite — aucun suivi implicite du responsable (lot 6, C-07)', () => {
  it('prioriser un incident n’ajoute PAS le responsable aux suiveurs', async () => {
    const incidentId = await createIncident();

    assertOk(await setPriorityIncidentService(incidentId, true, responsableId, 'RESPONSABLE'));

    expect(await activeFollowerCount(incidentId, responsableId)).toBe(0);
  });

  it('un suivi explicite préexistant est préservé quand le responsable agit ensuite', async () => {
    const incidentId = await createIncident();

    // Opt-in explicite : l'étoile.
    assertOk(await followIncidentService(incidentId, responsableId, 'RESPONSABLE'));
    expect(await activeFollowerCount(incidentId, responsableId)).toBe(1);

    // Le responsable agit (consigne, priorité) : le suivi n'est ni retiré ni dupliqué.
    assertOk(
      await setResponsibleCommentService(
        incidentId,
        'Contrôler la tête.',
        responsableId,
        'RESPONSABLE'
      )
    );
    assertOk(await setPriorityIncidentService(incidentId, true, responsableId, 'RESPONSABLE'));

    expect(await activeFollowerCount(incidentId, responsableId)).toBe(1);
  });
});
