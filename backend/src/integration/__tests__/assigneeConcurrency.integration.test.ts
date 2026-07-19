/**
 * Gate A concurrency proofs for technician assignment and account lifecycle.
 *
 * Every race is repeated so the release gate does not rely on a single lucky
 * scheduling. Explicit row blockers force both lock orders deterministically.
 */

import { Pool, PoolClient } from 'pg';
import { hashWorkshopPassword } from '../../auth/bcrypt';
import runMigrations from '../../db/migrate';
import {
  deactivateAccountService,
  updateAccountService,
} from '../../modules/accounts/accounts.service';
import {
  createIncidentService,
  takeIncidentService,
} from '../../modules/workshop/workshop.service';
import {
  acquireIntegrationAdminFixture,
  releaseIntegrationAdminFixture,
  type IntegrationAdminFixture,
} from '../helpers/adminFixture';

const DB_URL = process.env.DATABASE_URL!;
const ATTEMPTS = [1, 2, 3] as const;
const fixtureSuffix = `${process.pid}-${Date.now().toString(36)}`;
const lineNumber = `GA-${fixtureSuffix}`;
const machineId = `GA-M-${fixtureSuffix}`;
const operatorBadge = `GA-O-${fixtureSuffix}`;
const technicianBadge = `GA-T-${fixtureSuffix}`;

const machines = [
  {
    machineId,
    brand: 'Gate A',
    hasDoubleRobot: false,
    robotNumber: 'R01',
    robotHeads: 2,
  },
];

let pool: Pool;
let lineId: number;
let operatorId: number;
let technicianId: number;
let adminId: number;
let adminFixture: IntegrationAdminFixture | undefined;

beforeAll(async () => {
  pool = new Pool({ connectionString: DB_URL });
  await runMigrations();
  adminFixture = await acquireIntegrationAdminFixture(pool);
  adminId = adminFixture.admin.id;

  const passwordHash = await hashWorkshopPassword('gate_a_integration_password');
  const { rows: userRows } = await pool.query<{ id: number; badge_number: string }>(
    `INSERT INTO sentinel_users
       (first_name, last_name, badge_number, role, is_active, is_deleted, password_hash)
     VALUES
       ('Gate', 'Operator', $1, 'OPERATOR', TRUE, FALSE, $3),
       ('Gate', 'Technician', $2, 'MAINTENANCE', TRUE, FALSE, $3)
     RETURNING id, badge_number`,
    [operatorBadge, technicianBadge, passwordHash]
  );
  operatorId = userRows.find((row) => row.badge_number === operatorBadge)!.id;
  technicianId = userRows.find((row) => row.badge_number === technicianBadge)!.id;

  const { rows: lineRows } = await pool.query<{ id: number }>(
    `INSERT INTO production_lines (line_number, machine_sequence, is_active, is_deleted)
     VALUES ($1, $2::jsonb, TRUE, FALSE)
     RETURNING id`,
    [lineNumber, JSON.stringify(machines)]
  );
  lineId = lineRows[0].id;
}, 30_000);

afterEach(async () => {
  await cleanupIncidents();
  await pool.query('DELETE FROM account_audit_events WHERE target_user_id = $1', [technicianId]);
  await pool.query(
    `UPDATE sentinel_users
     SET role = 'MAINTENANCE', is_active = TRUE, is_deleted = FALSE, deleted_at = NULL
     WHERE id = $1`,
    [technicianId]
  );
});

afterAll(async () => {
  try {
    await cleanupIncidents();
    await pool.query('DELETE FROM account_audit_events WHERE target_user_id = $1', [technicianId]);
    await pool.query('DELETE FROM sentinel_users WHERE id = ANY($1::int[])', [
      [operatorId, technicianId],
    ]);
    await pool.query('DELETE FROM production_lines WHERE id = $1', [lineId]);
    if (adminFixture) await releaseIntegrationAdminFixture(pool, adminFixture);
  } finally {
    await pool.end();
  }
});

async function cleanupIncidents(): Promise<void> {
  if (!pool || !lineId) return;
  await pool.query(
    `DELETE FROM workshop_arbitration_cases
     WHERE incident_id IN (SELECT id FROM workshop_incidents WHERE line_id = $1)`,
    [lineId]
  );
  await pool.query(
    `DELETE FROM workshop_incident_events
     WHERE incident_id IN (SELECT id FROM workshop_incidents WHERE line_id = $1)`,
    [lineId]
  );
  await pool.query(
    `DELETE FROM workshop_incident_followers
     WHERE incident_id IN (SELECT id FROM workshop_incidents WHERE line_id = $1)`,
    [lineId]
  );
  await pool.query('DELETE FROM workshop_incidents WHERE line_id = $1', [lineId]);
}

async function createIncident(): Promise<number> {
  const result = await createIncidentService(
    {
      lineId,
      machineId,
      robotLabel: 'R01',
      headNumber: 1,
      state: 'DEGRADEE',
      currentProduct: 'GATE-A',
    },
    operatorId,
    'OPERATOR'
  );
  if (!result.ok) throw new Error(`Incident fixture creation failed: ${JSON.stringify(result)}`);
  return (result.data as { id: number }).id;
}

async function waitForBlockedRowLock(
  table: 'sentinel_users' | 'workshop_incidents',
  timeoutMs = 3_000
): Promise<void> {
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
           AND query ILIKE $1
           AND query ILIKE '%FOR UPDATE%'
       ) AS waiting`,
      [`%FROM ${table}%`]
    );
    if (rows[0].waiting) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`No blocked FOR UPDATE observed on ${table}.`);
}

async function incidentAssignment(incidentId: number): Promise<{
  is_taken: boolean;
  taken_by_user_id: number | null;
}> {
  const { rows } = await pool.query<{
    is_taken: boolean;
    taken_by_user_id: number | null;
  }>('SELECT is_taken, taken_by_user_id FROM workshop_incidents WHERE id = $1', [incidentId]);
  return rows[0];
}

async function technicianState(): Promise<{ role: string; is_active: boolean }> {
  const { rows } = await pool.query<{ role: string; is_active: boolean }>(
    'SELECT role, is_active FROM sentinel_users WHERE id = $1',
    [technicianId]
  );
  return rows[0];
}

async function eventCount(incidentId: number, eventType: string): Promise<number> {
  const { rows } = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
     FROM workshop_incident_events
     WHERE incident_id = $1 AND event_type = $2`,
    [incidentId, eventType]
  );
  return rows[0].count;
}

async function accountAuditCount(): Promise<number> {
  const { rows } = await pool.query<{ count: number }>(
    'SELECT COUNT(*)::int AS count FROM account_audit_events WHERE target_user_id = $1',
    [technicianId]
  );
  return rows[0].count;
}

async function expectTakeWinsAgainst(
  lifecycleMutation: () => ReturnType<typeof deactivateAccountService | typeof updateAccountService>
): Promise<void> {
  const incidentId = await createIncident();
  const blocker = await pool.connect();
  let transactionOpen = false;
  let takePromise: ReturnType<typeof takeIncidentService> | undefined;
  let lifecyclePromise: ReturnType<typeof lifecycleMutation> | undefined;

  try {
    await blocker.query('BEGIN');
    transactionOpen = true;
    await blocker.query('SELECT id FROM workshop_incidents WHERE id = $1 FOR UPDATE', [incidentId]);

    takePromise = takeIncidentService(incidentId, technicianId, 'MAINTENANCE');
    await waitForBlockedRowLock('workshop_incidents');

    lifecyclePromise = lifecycleMutation();
    await waitForBlockedRowLock('sentinel_users');

    await blocker.query('COMMIT');
    transactionOpen = false;

    const [takeResult, lifecycleResult] = await Promise.all([takePromise, lifecyclePromise]);
    expect(takeResult.ok).toBe(true);
    expect(lifecycleResult).toMatchObject({
      ok: false,
      status: 409,
      code: 'RESOURCE_IN_USE',
    });
    expect(await incidentAssignment(incidentId)).toEqual({
      is_taken: true,
      taken_by_user_id: technicianId,
    });
    expect(await technicianState()).toEqual({ role: 'MAINTENANCE', is_active: true });
    expect(await eventCount(incidentId, 'INCIDENT_TAKEN')).toBe(1);
    expect(await accountAuditCount()).toBe(0);
  } finally {
    if (transactionOpen) await blocker.query('ROLLBACK');
    blocker.release();
    await takePromise?.catch(() => undefined);
    await lifecyclePromise?.catch(() => undefined);
  }
}

async function expectLifecycleWinsBeforeTake(
  mutateLockedTechnician: (client: PoolClient) => Promise<unknown>,
  expectedState: { role: string; is_active: boolean }
): Promise<void> {
  const incidentId = await createIncident();
  const blocker = await pool.connect();
  let transactionOpen = false;
  let takePromise: ReturnType<typeof takeIncidentService> | undefined;

  try {
    await blocker.query('BEGIN');
    transactionOpen = true;
    await blocker.query('SELECT id FROM sentinel_users WHERE id = $1 FOR UPDATE', [technicianId]);

    takePromise = takeIncidentService(incidentId, technicianId, 'MAINTENANCE');
    await waitForBlockedRowLock('sentinel_users');
    await mutateLockedTechnician(blocker);
    await blocker.query('COMMIT');
    transactionOpen = false;

    const takeResult = await takePromise;
    expect(takeResult).toMatchObject({ ok: false, status: 403, code: 'FORBIDDEN' });
    expect(await incidentAssignment(incidentId)).toEqual({
      is_taken: false,
      taken_by_user_id: null,
    });
    expect(await technicianState()).toEqual(expectedState);
    expect(await eventCount(incidentId, 'INCIDENT_TAKEN')).toBe(0);
  } finally {
    if (transactionOpen) await blocker.query('ROLLBACK');
    blocker.release();
    await takePromise?.catch(() => undefined);
  }
}

describe('Assignee lifecycle serialization (real DB)', () => {
  it.each(ATTEMPTS)(
    'keeps the technician active when TAKE wins against deactivation (attempt %i)',
    async () => {
      await expectTakeWinsAgainst(() => deactivateAccountService(technicianId, adminId));
    }
  );

  it.each(ATTEMPTS)(
    'keeps the maintenance role when TAKE wins against a role change (attempt %i)',
    async () => {
      await expectTakeWinsAgainst(() =>
        updateAccountService(technicianId, { role: 'OPERATOR' }, adminId)
      );
    }
  );

  it.each(ATTEMPTS)(
    'rejects TAKE when concurrent deactivation commits first (attempt %i)',
    async () => {
      await expectLifecycleWinsBeforeTake(
        (client) =>
          client.query(
            `UPDATE sentinel_users
             SET is_active = FALSE, session_version = session_version + 1
             WHERE id = $1`,
            [technicianId]
          ),
        { role: 'MAINTENANCE', is_active: false }
      );
    }
  );

  it.each(ATTEMPTS)(
    'rejects TAKE when a concurrent role change commits first (attempt %i)',
    async () => {
      await expectLifecycleWinsBeforeTake(
        (client) =>
          client.query(
            `UPDATE sentinel_users
             SET role = 'OPERATOR', session_version = session_version + 1
             WHERE id = $1`,
            [technicianId]
          ),
        { role: 'OPERATOR', is_active: true }
      );
    }
  );
});
