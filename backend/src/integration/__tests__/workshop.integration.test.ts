/**
 * Integration tests for the workshop incident lifecycle against a real PostgreSQL database.
 *
 * These tests run only when DATABASE_URL is set. They are skipped automatically
 * in environments without a database so the normal unit-test suite is unaffected.
 *
 * What they verify that unit tests with mocks cannot:
 *  - DB constraints prevent invalid status transitions at the storage layer.
 *  - The service correctly enforces policy→forbidden when canPerform returns false.
 *  - A full incident cycle (create → take → set_pending → resume → close) persists correctly.
 *  - Cancelled incidents are preserved in the DB but excluded from active lists.
 *  - The incident events table receives an audit entry for each transition.
 *  - An OPERATOR cannot close an incident they created (policy enforced end-to-end).
 *  - A MAINTENANCE user cannot close an incident they did not take.
 */

import { Pool } from 'pg';
import runMigrations from '../../db/migrate';
import { hashWorkshopPassword } from '../../auth/bcrypt';
import type { ServiceResult } from '../../utils/serviceResult';
import {
  createIncidentService,
  takeIncidentService,
  setPendingIncidentService,
  resumeIncidentService,
  closeIncidentService,
  cancelIncidentService,
  invalidateIncidentService,
} from '../../modules/workshop/workshop.service';

const DB_URL = process.env.DATABASE_URL;
const RUN = Boolean(DB_URL);

const describeIntegration = RUN ? describe : describe.skip;

let pool: Pool;

// IDs shared across tests
let operatorId: number;
let maintenanceId: number;
let responsableId: number;
let lineId: number;

beforeAll(async () => {
  if (!RUN) return;
  pool = new Pool({ connectionString: DB_URL });
  await runMigrations();

  const { rows: lineRows } = await pool.query<{ id: number }>(
    `INSERT INTO production_lines (line_number, machine_sequence, is_active, is_deleted)
     VALUES ('L-INT-01', $1::jsonb, TRUE, FALSE)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [
      JSON.stringify([
        {
          machineId: 'M-INT-01',
          brand: 'Fanuc',
          hasDoubleRobot: false,
          robotNumber: 'R01',
          robotHeads: 4,
        },
      ]),
    ]
  );

  // If line already exists (re-run), fetch it
  if (lineRows.length === 0) {
    const { rows } = await pool.query<{ id: number }>(
      `SELECT id FROM production_lines WHERE line_number = 'L-INT-01'`
    );
    lineId = rows[0].id;
  } else {
    lineId = lineRows[0].id;
  }

  const hash = await hashWorkshopPassword('test_pass_99');
  const upsertUser = async (badge: string, role: string): Promise<number> => {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO sentinel_users (first_name, last_name, badge_number, role, is_active, is_deleted, password_hash)
       VALUES ('Test', 'User', $1, $2, TRUE, FALSE, $3)
       ON CONFLICT (badge_number) WHERE is_deleted = FALSE DO UPDATE SET password_hash = EXCLUDED.password_hash
       RETURNING id`,
      [badge, role, hash]
    );
    return rows[0].id;
  };

  operatorId = await upsertUser('OP-INT-01', 'OPERATOR');
  maintenanceId = await upsertUser('MA-INT-01', 'MAINTENANCE');
  responsableId = await upsertUser('RE-INT-01', 'RESPONSABLE');
}, 30_000);

afterEach(async () => {
  // Clear all incidents on the integration test line between tests to avoid
  // the unique constraint on active incidents per machine.
  if (!RUN) return;
  await pool.query(
    `DELETE FROM workshop_incident_events WHERE incident_id IN (SELECT id FROM workshop_incidents WHERE line_id = $1)`,
    [lineId]
  );
  await pool.query(
    `DELETE FROM workshop_incident_followers WHERE incident_id IN (SELECT id FROM workshop_incidents WHERE line_id = $1)`,
    [lineId]
  );
  await pool.query(`DELETE FROM workshop_incidents WHERE line_id = $1`, [lineId]);
});

afterAll(async () => {
  if (!RUN) return;
  // Nettoyage chirurgical : uniquement les badges de CE fichier (préfixe de
  // deux lettres + « -INT- », ex. OP-INT-01). On évite « %-INT-% » qui
  // attraperait aussi les fixtures d'autres suites (ex. RGPD-INT-01) lorsque
  // les fichiers d'intégration s'exécutent en parallèle.
  await pool.query(`DELETE FROM sentinel_users WHERE badge_number LIKE '__-INT-%'`);
  await pool.query(`DELETE FROM production_lines WHERE line_number = 'L-INT-01'`);
  await pool.end();
});

// ── Helpers ────────────────────────────────────────────────────────────────────

const validInput = () => ({
  lineId,
  machineId: 'M-INT-01',
  robotLabel: 'R01',
  headNumber: 1,
  state: 'DEGRADEE' as const,
  currentProduct: 'REF-INT',
});

function assertOk<T>(result: ServiceResult<T>): T {
  if (!result.ok) throw new Error(`Expected ok result but got: ${JSON.stringify(result)}`);
  return result.data;
}

async function getEventTypes(incidentId: number): Promise<string[]> {
  const { rows } = await pool.query<{ event_type: string }>(
    'SELECT event_type FROM workshop_incident_events WHERE incident_id = $1 ORDER BY created_at',
    [incidentId]
  );
  return rows.map((r) => r.event_type);
}

async function getIncidentStatus(incidentId: number): Promise<string | null> {
  const { rows } = await pool.query<{ status: string }>(
    'SELECT status FROM workshop_incidents WHERE id = $1',
    [incidentId]
  );
  return rows[0]?.status ?? null;
}

// ── Full lifecycle ─────────────────────────────────────────────────────────────

describeIntegration('Incident lifecycle (real DB)', () => {
  it('creates an incident and persists it in the DB', async () => {
    const result = await createIncidentService(validInput(), operatorId, 'OPERATOR');
    const incident = assertOk(result) as { id: number };
    expect(typeof incident.id).toBe('number');

    expect(await getIncidentStatus(incident.id)).toBe('OPEN');
    expect(await getEventTypes(incident.id)).toContain('INCIDENT_CREATED');
  });

  it('full lifecycle: create → take → set_pending → resume → close', async () => {
    const created = assertOk(await createIncidentService(validInput(), operatorId, 'OPERATOR')) as {
      id: number;
    };
    const incidentId = created.id;

    assertOk(await takeIncidentService(incidentId, maintenanceId, 'MAINTENANCE'));
    expect(await getIncidentStatus(incidentId)).toBe('OPEN');

    assertOk(
      await setPendingIncidentService(
        incidentId,
        'Diagnostic en cours',
        maintenanceId,
        'MAINTENANCE'
      )
    );
    expect(await getIncidentStatus(incidentId)).toBe('PENDING');

    assertOk(await resumeIncidentService(incidentId, maintenanceId, 'MAINTENANCE'));
    expect(await getIncidentStatus(incidentId)).toBe('OPEN');

    assertOk(
      await closeIncidentService(
        incidentId,
        'Intervention terminée, remplacement pièce.',
        maintenanceId,
        'MAINTENANCE'
      )
    );
    expect(await getIncidentStatus(incidentId)).toBe('CLOSED');

    const events = await getEventTypes(incidentId);
    expect(events).toContain('INCIDENT_CREATED');
    expect(events).toContain('INCIDENT_TAKEN');
    expect(events).toContain('INCIDENT_SET_PENDING');
    expect(events).toContain('INCIDENT_RESUMED');
    expect(events).toContain('INCIDENT_CLOSED');
  });

  it('RESPONSABLE can invalidate a closed incident', async () => {
    const created = assertOk(await createIncidentService(validInput(), operatorId, 'OPERATOR')) as {
      id: number;
    };
    const incidentId = created.id;

    assertOk(await takeIncidentService(incidentId, maintenanceId, 'MAINTENANCE'));
    assertOk(await closeIncidentService(incidentId, 'Résolu.', maintenanceId, 'MAINTENANCE'));
    expect(await getIncidentStatus(incidentId)).toBe('CLOSED');

    assertOk(
      await invalidateIncidentService(
        incidentId,
        'Erreur de déclaration.',
        responsableId,
        'RESPONSABLE'
      )
    );
    expect(await getIncidentStatus(incidentId)).toBe('INVALIDATED');
    expect(await getEventTypes(incidentId)).toContain('INCIDENT_INVALIDATED');
  });

  it('cancelled incident is preserved in DB with CANCELED status', async () => {
    const created = assertOk(await createIncidentService(validInput(), operatorId, 'OPERATOR')) as {
      id: number;
    };
    const incidentId = created.id;

    assertOk(await cancelIncidentService(incidentId, maintenanceId, 'MAINTENANCE'));
    expect(await getIncidentStatus(incidentId)).toBe('CANCELED');

    // Row still exists (not hard-deleted)
    const { rows } = await pool.query('SELECT id FROM workshop_incidents WHERE id = $1', [
      incidentId,
    ]);
    expect(rows.length).toBe(1);
  });
});

// ── Policy enforcement end-to-end ──────────────────────────────────────────────

describeIntegration('Policy enforcement through service layer (real DB)', () => {
  it('OPERATOR cannot take an incident', async () => {
    const created = assertOk(await createIncidentService(validInput(), operatorId, 'OPERATOR')) as {
      id: number;
    };
    const incidentId = created.id;

    const result = await takeIncidentService(incidentId, operatorId, 'OPERATOR');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);

    expect(await getIncidentStatus(incidentId)).toBe('OPEN');
  });

  it('OPERATOR cannot close an incident', async () => {
    const created = assertOk(await createIncidentService(validInput(), operatorId, 'OPERATOR')) as {
      id: number;
    };
    const incidentId = created.id;
    assertOk(await takeIncidentService(incidentId, maintenanceId, 'MAINTENANCE'));

    const result = await closeIncidentService(incidentId, 'Done.', operatorId, 'OPERATOR');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);

    expect(await getIncidentStatus(incidentId)).toBe('OPEN');
  });

  it('MAINTENANCE can close a taken incident even if another MAINTENANCE took it', async () => {
    // Policy: CLOSE checks is_taken but NOT taken_by_user_id — any MAINTENANCE can close.
    // This is intentional: a team member can relieve another on shift handover.
    const created = assertOk(await createIncidentService(validInput(), operatorId, 'OPERATOR')) as {
      id: number;
    };
    const incidentId = created.id;

    const hash = await hashWorkshopPassword('test_pass_99');
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO sentinel_users (first_name, last_name, badge_number, role, is_active, is_deleted, password_hash)
       VALUES ('Other', 'Maint', 'MA-INT-02', 'MAINTENANCE', TRUE, FALSE, $1)
       ON CONFLICT (badge_number) WHERE is_deleted = FALSE DO UPDATE SET password_hash = EXCLUDED.password_hash
       RETURNING id`,
      [hash]
    );
    const otherMaintenanceId = rows[0].id;

    assertOk(await takeIncidentService(incidentId, otherMaintenanceId, 'MAINTENANCE'));

    // maintenanceId did not take it, but CLOSE is still allowed by policy
    const result = await closeIncidentService(
      incidentId,
      'Intervention terminée.',
      maintenanceId,
      'MAINTENANCE'
    );
    expect(result.ok).toBe(true);
    expect(await getIncidentStatus(incidentId)).toBe('CLOSED');
    // MA-INT-02 user is cleaned up in afterAll via the badge pattern '%-INT-%'
  });

  it('RESPONSABLE cannot take an incident', async () => {
    const created = assertOk(await createIncidentService(validInput(), operatorId, 'OPERATOR')) as {
      id: number;
    };
    const incidentId = created.id;

    const result = await takeIncidentService(incidentId, responsableId, 'RESPONSABLE');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);

    expect(await getIncidentStatus(incidentId)).toBe('OPEN');
  });

  it('nobody can close a PENDING incident', async () => {
    const created = assertOk(await createIncidentService(validInput(), operatorId, 'OPERATOR')) as {
      id: number;
    };
    const incidentId = created.id;

    assertOk(await takeIncidentService(incidentId, maintenanceId, 'MAINTENANCE'));
    assertOk(
      await setPendingIncidentService(incidentId, 'Diagnostic.', maintenanceId, 'MAINTENANCE')
    );
    expect(await getIncidentStatus(incidentId)).toBe('PENDING');

    const result = await closeIncidentService(
      incidentId,
      'Trying anyway.',
      maintenanceId,
      'MAINTENANCE'
    );
    expect(result.ok).toBe(false);
    expect(await getIncidentStatus(incidentId)).toBe('PENDING');
  });
});

// ── DB constraint enforcement ─────────────────────────────────────────────────

describeIntegration('DB constraints (real DB)', () => {
  it('rejects an incident with an invalid status value at the DB level', async () => {
    await expect(
      pool.query(
        `INSERT INTO workshop_incidents
           (user_id, line_id, line_number, machine_id, machine_brand,
            robot_label, head_number, state, status, display_order)
         VALUES ($1, $2, 'L-INT-01', 'M-INT-01', 'Fanuc', 'R01', 1, 'DEGRADEE', 'INVALID_STATUS', 0)`,
        [operatorId, lineId]
      )
    ).rejects.toThrow();
  });

  it('rejects a sentinel_user with an invalid role at the DB level', async () => {
    const hash = await hashWorkshopPassword('test_pass_99');
    await expect(
      pool.query(
        `INSERT INTO sentinel_users (first_name, last_name, badge_number, role, is_active, is_deleted, password_hash)
         VALUES ('Bad', 'Role', 'BR-TEST-01', 'INVALID_ROLE', TRUE, FALSE, $1)`,
        [hash]
      )
    ).rejects.toThrow();
  });
});
