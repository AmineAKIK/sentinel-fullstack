/**
 * Integration tests for the workshop incident lifecycle against a real PostgreSQL database.
 *
 * The integration project guard requires a dedicated PostgreSQL database whose
 * name ends with `_test` or `_integration` before this suite can start.
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
import { archiveLineService, updateLineService } from '../../modules/lines/lines.service';
import type { UpdateLineInput } from '../../modules/lines/lines.validation';
import {
  createIncidentService,
  takeIncidentService,
  setPendingIncidentService,
  resumeIncidentService,
  closeIncidentService,
  cancelIncidentService,
  invalidateIncidentService,
  updateIncidentService,
} from '../../modules/workshop/workshop.service';
import {
  acquireIntegrationAdminFixture,
  releaseIntegrationAdminFixture,
  type IntegrationAdminFixture,
} from '../helpers/adminFixture';

const DB_URL = process.env.DATABASE_URL!;

let pool: Pool;

// IDs shared across tests
let operatorId: number;
let maintenanceId: number;
let responsableId: number;
let lineId: number;
let adminId: number;
let adminFixture: IntegrationAdminFixture | undefined;

const INTEGRATION_LINE_NUMBER = '930001';
const RENAMED_LINE_NUMBER = '930002';
const OPERATOR_BADGE = '9300101';
const MAINTENANCE_BADGE = '9300102';
const RESPONSABLE_BADGE = '9300103';
const OTHER_MAINTENANCE_BADGE = '9300104';

const integrationMachines = [
  {
    machineId: 'M-INT-01',
    brand: 'Fanuc',
    hasDoubleRobot: false,
    robotNumber: 'R01',
    robotHeads: 4,
  },
];

const structuralLineMutations: Array<[string, UpdateLineInput]> = [
  ['line number', { lineNumber: RENAMED_LINE_NUMBER }],
  [
    'machine configuration',
    {
      machines: [
        {
          machineId: 'M-INT-REPLACEMENT',
          brand: 'ABB',
          hasDoubleRobot: false,
          robotNumber: 'R02',
          robotHeads: 2,
        },
      ],
    },
  ],
  ['deactivation', { isActive: false }],
];

beforeAll(async () => {
  pool = new Pool({ connectionString: DB_URL });
  await runMigrations();
  adminFixture = await acquireIntegrationAdminFixture(pool);
  adminId = adminFixture.admin.id;

  const { rows: lineRows } = await pool.query<{ id: number }>(
    `INSERT INTO production_lines (line_number, machine_sequence, is_active, is_deleted)
     VALUES ($1, $2::jsonb, TRUE, FALSE)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [INTEGRATION_LINE_NUMBER, JSON.stringify(integrationMachines)]
  );

  // If line already exists (re-run), fetch it
  if (lineRows.length === 0) {
    const { rows } = await pool.query<{ id: number }>(
      `SELECT id FROM production_lines WHERE line_number = $1`,
      [INTEGRATION_LINE_NUMBER]
    );
    lineId = rows[0].id;
  } else {
    lineId = lineRows[0].id;
  }

  await pool.query(
    `UPDATE production_lines
     SET line_number = $2,
         machine_sequence = $3::jsonb,
         is_active = TRUE,
         is_deleted = FALSE,
         deleted_at = NULL,
         updated_at = NOW()
     WHERE id = $1`,
    [lineId, INTEGRATION_LINE_NUMBER, JSON.stringify(integrationMachines)]
  );
  await pool.query('DELETE FROM line_audit_events WHERE target_line_id = $1', [lineId]);

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

  operatorId = await upsertUser(OPERATOR_BADGE, 'OPERATOR');
  maintenanceId = await upsertUser(MAINTENANCE_BADGE, 'MAINTENANCE');
  responsableId = await upsertUser(RESPONSABLE_BADGE, 'RESPONSABLE');
}, 30_000);

afterEach(async () => {
  await pool.query(
    `UPDATE production_lines
     SET line_number = $2,
         machine_sequence = $3::jsonb,
         is_active = TRUE,
         is_deleted = FALSE,
         deleted_at = NULL,
         updated_at = NOW()
     WHERE id = $1`,
    [lineId, INTEGRATION_LINE_NUMBER, JSON.stringify(integrationMachines)]
  );
  await pool.query('DELETE FROM line_audit_events WHERE target_line_id = $1', [lineId]);

  // Clear all incidents on the integration test line between tests to avoid
  // the unique constraint on active incidents per machine.
  await pool.query(
    `DELETE FROM workshop_arbitration_cases WHERE incident_id IN (SELECT id FROM workshop_incidents WHERE line_id = $1)`,
    [lineId]
  );
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
  await pool.query('DELETE FROM line_audit_events WHERE target_line_id = $1', [lineId]);
  await pool.query('DELETE FROM sentinel_users WHERE badge_number = ANY($1::varchar[])', [
    [OPERATOR_BADGE, MAINTENANCE_BADGE, RESPONSABLE_BADGE, OTHER_MAINTENANCE_BADGE],
  ]);
  await pool.query('DELETE FROM production_lines WHERE id = $1', [lineId]);
  if (adminFixture) await releaseIntegrationAdminFixture(pool, adminFixture);
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

async function getIncidentMutationSnapshot(incidentId: number): Promise<{
  updated_at: Date;
  edit_request: Record<string, unknown> | null;
}> {
  const { rows } = await pool.query<{
    updated_at: Date;
    edit_request: Record<string, unknown> | null;
  }>('SELECT updated_at, edit_request FROM workshop_incidents WHERE id = $1', [incidentId]);
  return rows[0];
}

async function countArbitrationCases(incidentId: number): Promise<number> {
  const { rows } = await pool.query<{ count: number }>(
    'SELECT COUNT(*)::int AS count FROM workshop_arbitration_cases WHERE incident_id = $1',
    [incidentId]
  );
  return rows[0].count;
}

async function waitForWorkshopLineLockWait(timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const { rows } = await pool.query<{ waiting: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM pg_stat_activity
         WHERE datname = current_database()
           AND pid <> pg_backend_pid()
           AND state = 'active'
           AND wait_event_type = 'Lock'
           AND query ILIKE '%FROM production_lines%'
           AND query ILIKE '%FOR UPDATE%'
       ) AS waiting`
    );
    if (rows[0].waiting) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error("La mutation concurrente n'a pas atteint le verrou de ligne à temps.");
}

// ── Full lifecycle ─────────────────────────────────────────────────────────────

describe('Incident lifecycle (real DB)', () => {
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

describe('No-op incident mutations (real DB)', () => {
  it('preserves the incident timestamp and audit trail after an identical direct edit', async () => {
    const created = assertOk(await createIncidentService(validInput(), operatorId, 'OPERATOR')) as {
      id: number;
    };
    const before = await getIncidentMutationSnapshot(created.id);
    const eventsBefore = await getEventTypes(created.id);
    await pool.query('SELECT pg_sleep(0.02)');

    const result = await updateIncidentService(
      created.id,
      { ...validInput(), comment: '' },
      responsableId,
      'RESPONSABLE'
    );

    expect(result.ok).toBe(true);
    const after = await getIncidentMutationSnapshot(created.id);
    expect(after.updated_at.toISOString()).toBe(before.updated_at.toISOString());
    expect(await getEventTypes(created.id)).toEqual(eventsBefore);

    const { rows: followerRows } = await pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM workshop_incident_followers
       WHERE incident_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [created.id, responsableId]
    );
    expect(followerRows[0].count).toBe(0);
  });

  it('rejects an identical operator request without updating or opening arbitration', async () => {
    const created = assertOk(await createIncidentService(validInput(), operatorId, 'OPERATOR')) as {
      id: number;
    };
    const before = await getIncidentMutationSnapshot(created.id);
    const eventsBefore = await getEventTypes(created.id);
    await pool.query('SELECT pg_sleep(0.02)');

    const result = await updateIncidentService(
      created.id,
      { requestOnly: true, ...validInput(), comment: '' },
      operatorId,
      'OPERATOR'
    );

    expect(result).toMatchObject({ ok: false, status: 400, code: 'NO_CHANGES' });
    const after = await getIncidentMutationSnapshot(created.id);
    expect(after.updated_at.toISOString()).toBe(before.updated_at.toISOString());
    expect(after.edit_request).toBeNull();
    expect(await getEventTypes(created.id)).toEqual(eventsBefore);
    expect(await countArbitrationCases(created.id)).toBe(0);
  });
});

describe('Incident line locking (real DB)', () => {
  it.each([1, 2, 3])(
    'never creates an incident on a line archived by a concurrent transaction (attempt %i)',
    async () => {
      const blocker = await pool.connect();
      let transactionOpen = false;
      let createPromise: ReturnType<typeof createIncidentService> | undefined;

      try {
        await blocker.query('BEGIN');
        transactionOpen = true;
        await blocker.query('SELECT id FROM production_lines WHERE id = $1 FOR UPDATE', [lineId]);

        createPromise = createIncidentService(validInput(), operatorId, 'OPERATOR');
        await waitForWorkshopLineLockWait();

        await blocker.query(
          `UPDATE production_lines
         SET is_deleted = TRUE, deleted_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
          [lineId]
        );
        await blocker.query('COMMIT');
        transactionOpen = false;

        const result = await createPromise;
        expect(result).toMatchObject({ ok: false, status: 404, code: 'NOT_FOUND' });

        const { rows } = await pool.query<{ count: number }>(
          'SELECT COUNT(*)::int AS count FROM workshop_incidents WHERE line_id = $1',
          [lineId]
        );
        expect(rows[0].count).toBe(0);
      } finally {
        if (transactionOpen) await blocker.query('ROLLBACK');
        blocker.release();
        await createPromise?.catch(() => undefined);
      }
    }
  );

  it.each([1, 2, 3])(
    'rejects a direct edit when concurrent line reconfiguration invalidates its machine (attempt %i)',
    async () => {
      const created = assertOk(
        await createIncidentService(validInput(), operatorId, 'OPERATOR')
      ) as {
        id: number;
      };
      const eventsBefore = await getEventTypes(created.id);
      const blocker = await pool.connect();
      let transactionOpen = false;
      let editPromise: ReturnType<typeof updateIncidentService> | undefined;
      const replacementMachines = [
        {
          machineId: `M-INT-RACE-${lineId}`,
          brand: 'ABB',
          hasDoubleRobot: false,
          robotNumber: 'R99',
          robotHeads: 2,
        },
      ];

      try {
        await blocker.query('BEGIN');
        transactionOpen = true;
        await blocker.query('SELECT id FROM production_lines WHERE id = $1 FOR UPDATE', [lineId]);

        editPromise = updateIncidentService(
          created.id,
          { state: 'INDISPONIBLE' },
          responsableId,
          'RESPONSABLE'
        );
        await waitForWorkshopLineLockWait();

        await blocker.query(
          `UPDATE production_lines
         SET machine_sequence = $2::jsonb, updated_at = NOW()
         WHERE id = $1`,
          [lineId, JSON.stringify(replacementMachines)]
        );
        await blocker.query('COMMIT');
        transactionOpen = false;

        const result = await editPromise;
        expect(result).toMatchObject({ ok: false, status: 400, code: 'VALIDATION_ERROR' });

        const { rows } = await pool.query<{ state: string }>(
          'SELECT state FROM workshop_incidents WHERE id = $1',
          [created.id]
        );
        expect(rows[0].state).toBe('DEGRADEE');
        expect(await getEventTypes(created.id)).toEqual(eventsBefore);
      } finally {
        if (transactionOpen) await blocker.query('ROLLBACK');
        blocker.release();
        await editPromise?.catch(() => undefined);
      }
    }
  );

  it.each([1, 2, 3])(
    'keeps an edit request open when concurrent reconfiguration invalidates approval (attempt %i)',
    async () => {
      const created = assertOk(
        await createIncidentService(validInput(), operatorId, 'OPERATOR')
      ) as {
        id: number;
      };
      assertOk(
        await updateIncidentService(
          created.id,
          { requestOnly: true, state: 'INDISPONIBLE' },
          operatorId,
          'OPERATOR'
        )
      );
      const blocker = await pool.connect();
      let transactionOpen = false;
      let approvalPromise: ReturnType<typeof updateIncidentService> | undefined;
      const replacementMachines = [
        {
          machineId: `M-INT-APPROVAL-${lineId}`,
          brand: 'Kuka',
          hasDoubleRobot: false,
          robotNumber: 'R98',
          robotHeads: 2,
        },
      ];

      try {
        await blocker.query('BEGIN');
        transactionOpen = true;
        await blocker.query('SELECT id FROM production_lines WHERE id = $1 FOR UPDATE', [lineId]);

        approvalPromise = updateIncidentService(
          created.id,
          { applyEditRequest: true },
          responsableId,
          'RESPONSABLE'
        );
        await waitForWorkshopLineLockWait();

        await blocker.query(
          `UPDATE production_lines
         SET machine_sequence = $2::jsonb, updated_at = NOW()
         WHERE id = $1`,
          [lineId, JSON.stringify(replacementMachines)]
        );
        await blocker.query('COMMIT');
        transactionOpen = false;

        const result = await approvalPromise;
        expect(result).toMatchObject({ ok: false, status: 400, code: 'VALIDATION_ERROR' });

        const snapshot = await getIncidentMutationSnapshot(created.id);
        expect(snapshot.edit_request).toMatchObject({ state: 'INDISPONIBLE' });
        expect(await countArbitrationCases(created.id)).toBe(1);
        expect(await getEventTypes(created.id)).not.toContain('EDIT_APPLIED');
      } finally {
        if (transactionOpen) await blocker.query('ROLLBACK');
        blocker.release();
        await approvalPromise?.catch(() => undefined);
      }
    }
  );
});

describe('Active line structural freeze (real DB)', () => {
  it.each(structuralLineMutations)(
    'rejects %s while an active incident references the line',
    async (_label, updates) => {
      assertOk(await createIncidentService(validInput(), operatorId, 'OPERATOR'));

      const result = await updateLineService(lineId, updates, adminId);

      expect(result).toMatchObject({ ok: false, status: 409, code: 'RESOURCE_IN_USE' });
      const { rows } = await pool.query<{
        line_number: string;
        machine_sequence: typeof integrationMachines;
        is_active: boolean;
      }>(
        `SELECT line_number, machine_sequence, is_active
         FROM production_lines
         WHERE id = $1`,
        [lineId]
      );
      expect(rows[0]).toEqual({
        line_number: INTEGRATION_LINE_NUMBER,
        machine_sequence: integrationMachines,
        is_active: true,
      });
      const { rows: auditRows } = await pool.query<{ count: number }>(
        'SELECT COUNT(*)::int AS count FROM line_audit_events WHERE target_line_id = $1',
        [lineId]
      );
      expect(auditRows[0].count).toBe(0);
    }
  );

  it('rejects archival after a concurrent-safe incident creation', async () => {
    assertOk(await createIncidentService(validInput(), operatorId, 'OPERATOR'));

    const result = await archiveLineService(lineId, adminId);

    expect(result).toMatchObject({
      ok: false,
      status: 409,
      code: 'LINE_HAS_ACTIVE_INCIDENTS',
    });
    const { rows } = await pool.query<{ is_deleted: boolean }>(
      'SELECT is_deleted FROM production_lines WHERE id = $1',
      [lineId]
    );
    expect(rows[0].is_deleted).toBe(false);
  });

  it('allows a rename after closure without rewriting the incident snapshot', async () => {
    const created = assertOk(await createIncidentService(validInput(), operatorId, 'OPERATOR')) as {
      id: number;
    };
    assertOk(await takeIncidentService(created.id, maintenanceId, 'MAINTENANCE'));
    assertOk(
      await closeIncidentService(
        created.id,
        'Intervention terminée pour vérifier le snapshot de ligne.',
        maintenanceId,
        'MAINTENANCE'
      )
    );

    const result = await updateLineService(lineId, { lineNumber: RENAMED_LINE_NUMBER }, adminId);

    expect(result.ok).toBe(true);
    const { rows } = await pool.query<{ line_number: string }>(
      'SELECT line_number FROM workshop_incidents WHERE id = $1',
      [created.id]
    );
    expect(rows[0].line_number).toBe(INTEGRATION_LINE_NUMBER);
  });
});

// ── Policy enforcement end-to-end ──────────────────────────────────────────────

describe('Policy enforcement through service layer (real DB)', () => {
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
       VALUES ('Other', 'Maint', $2, 'MAINTENANCE', TRUE, FALSE, $1)
       ON CONFLICT (badge_number) WHERE is_deleted = FALSE DO UPDATE SET password_hash = EXCLUDED.password_hash
       RETURNING id`,
      [hash, OTHER_MAINTENANCE_BADGE]
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
    // Le compte secondaire est supprimé avec les autres badges réservés à cette suite.
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

describe('DB constraints (real DB)', () => {
  it('rejects an incident with an invalid status value at the DB level', async () => {
    await expect(
      pool.query(
        `INSERT INTO workshop_incidents
           (user_id, line_id, line_number, machine_id, machine_brand,
            robot_label, head_number, state, status, display_order)
         VALUES ($1, $2, $3, 'M-INT-01', 'Fanuc', 'R01', 1, 'DEGRADEE', 'INVALID_STATUS', 0)`,
        [operatorId, lineId, INTEGRATION_LINE_NUMBER]
      )
    ).rejects.toThrow();
  });

  it('rejects a sentinel_user with an invalid role at the DB level', async () => {
    const hash = await hashWorkshopPassword('test_pass_99');
    await expect(
      pool.query(
        `INSERT INTO sentinel_users (first_name, last_name, badge_number, role, is_active, is_deleted, password_hash)
         VALUES ('Bad', 'Role', '9300199', 'INVALID_ROLE', TRUE, FALSE, $1)`,
        [hash]
      )
    ).rejects.toThrow();
  });
});
