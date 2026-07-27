/**
 * Preuve PostgreSQL réelle du lot 5 (C-06, volet Board) : la projection du
 * Board (`getBoardData`) expose UNIQUEMENT l'existence d'un arbitrage par type
 * de demande — un booléen `has_edit_arbitration` / `has_cancel_arbitration` —
 * et jamais le motif d'annulation, le contenu de la demande, ni une identité.
 *
 * Cette preuve exécute réellement l'expression SQL dérivée
 * (`(edit_request IS NOT NULL)`, `(cancel_request = TRUE)`) sur un PostgreSQL
 * isolé, plutôt que de se contenter d'assertions sur la chaîne de requête.
 */

import { Pool } from 'pg';
import runMigrations from '../../db/migrate';
import { hashWorkshopPassword } from '../../auth/bcrypt';
import { getBoardData } from '../../modules/workshop/workshop.repository';

const DB_URL = process.env.DATABASE_URL!;
const fixtureSuffix = `${process.pid}${Date.now()}`;
const lineNumber = `88${fixtureSuffix}1`;
const operatorBadge = `88${fixtureSuffix}2`;
const machineFor = (slot: string) => `BRD-M-${fixtureSuffix}-${slot}`;

let pool: Pool;
let lineId: number;
let operatorId: number;
let cancelIncidentId: number;
let editIncidentId: number;
let plainIncidentId: number;

// Une machine distincte par incident : un index unique partiel interdit
// plusieurs incidents actifs sur une même machine (idx_unique_active_incident_per_machine).
const machines = ['cancel', 'edit', 'plain'].map((slot) => ({
  machineId: machineFor(slot),
  brand: 'Board',
  hasDoubleRobot: false,
  robotNumber: 'R01',
  robotHeads: 1,
}));

async function insertIncident(
  slot: string,
  overrides: {
    cancelRequest?: boolean;
    cancelReason?: string | null;
    editRequest?: object | null;
  }
): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO workshop_incidents
       (user_id, line_id, line_number, machine_id, machine_brand, robot_label, head_number,
        state, status, is_taken, is_priority, cancel_request, cancel_request_reason,
        edit_request, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'Board', 'R01', 1, 'DEGRADEE', 'OPEN', FALSE, FALSE,
             $5, $6, $7::jsonb, NOW(), NOW())
     RETURNING id`,
    [
      operatorId,
      lineId,
      lineNumber,
      machineFor(slot),
      overrides.cancelRequest ?? false,
      overrides.cancelReason ?? null,
      overrides.editRequest ? JSON.stringify(overrides.editRequest) : null,
    ]
  );
  return rows[0].id;
}

beforeAll(async () => {
  pool = new Pool({ connectionString: DB_URL });
  await runMigrations();

  const passwordHash = await hashWorkshopPassword('board_projection_password');
  const { rows: userRows } = await pool.query<{ id: number }>(
    `INSERT INTO sentinel_users
       (first_name, last_name, badge_number, role, is_active, is_deleted, password_hash)
     VALUES ('Board', 'Fixture', $1, 'OPERATOR', TRUE, FALSE, $2)
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

  cancelIncidentId = await insertIncident('cancel', {
    cancelRequest: true,
    cancelReason: 'Doublon de signalement.',
  });
  editIncidentId = await insertIncident('edit', { editRequest: { state: 'INDISPONIBLE' } });
  plainIncidentId = await insertIncident('plain', {});
}, 30_000);

afterAll(async () => {
  await pool.query('DELETE FROM workshop_incidents WHERE line_id = $1', [lineId]);
  await pool.query('DELETE FROM production_lines WHERE id = $1', [lineId]);
  await pool.query('DELETE FROM sentinel_users WHERE id = $1', [operatorId]);
  await pool.end();
});

describe('projection Board — indicateur d’arbitrage minimal (lot 5, C-06)', () => {
  it('dérive un booléen par type de demande, sans motif ni identité', async () => {
    const board = await getBoardData();
    const byId = new Map(
      board.incidents.map((incident) => [
        (incident as { id: number }).id,
        incident as Record<string, unknown>,
      ])
    );

    const cancelRow = byId.get(cancelIncidentId)!;
    const editRow = byId.get(editIncidentId)!;
    const plainRow = byId.get(plainIncidentId)!;

    // Une demande d'annulation en attente → booléen d'annulation vrai seulement.
    expect(cancelRow.has_cancel_arbitration).toBe(true);
    expect(cancelRow.has_edit_arbitration).toBe(false);

    // Une demande de correction en attente → booléen de correction vrai seulement.
    expect(editRow.has_edit_arbitration).toBe(true);
    expect(editRow.has_cancel_arbitration).toBe(false);

    // Aucun arbitrage → les deux booléens sont faux.
    expect(plainRow.has_cancel_arbitration).toBe(false);
    expect(plainRow.has_edit_arbitration).toBe(false);

    // Le Board ne reçoit NI le motif d'annulation, NI le contenu de la demande
    // de correction, NI un identifiant de demandeur/arbitre.
    for (const row of [cancelRow, editRow, plainRow]) {
      expect(row).not.toHaveProperty('cancel_request_reason');
      expect(row).not.toHaveProperty('edit_request');
      expect(row).not.toHaveProperty('decided_by');
      expect(row).not.toHaveProperty('user_id');
    }
  });
});
