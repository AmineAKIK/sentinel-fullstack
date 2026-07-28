/**
 * Preuve PostgreSQL réelle RC4 R4-04 : le Board expose uniquement le motif
 * courant nécessaire à un incident PENDING, sans élargir sa projection privée.
 */

import { Pool } from 'pg';
import runMigrations from '../../db/migrate';
import { hashWorkshopPassword } from '../../auth/bcrypt';
import { getBoardData } from '../../modules/workshop/workshop.repository';
import {
  resumeIncidentService,
  setPendingIncidentService,
} from '../../modules/workshop/workshop.service.mutations';

const DB_URL = process.env.DATABASE_URL!;
const fixtureSuffix = `${process.pid}${Date.now()}`;
const lineNumber = `84${fixtureSuffix}1`;
const operatorBadge = `84${fixtureSuffix}2`;
const maintenanceBadge = `84${fixtureSuffix}3`;
const machineFor = (slot: string) => `BRD-WR-${fixtureSuffix}-${slot}`;
const exactReason = 'RC4-PG-MOTIF-COMPLET-'.padEnd(1000, 'x');
const serviceReason = 'RC4 — attente pièce détachée — conservation historique';
const privateDiagnostic = 'RC4-DIAGNOSTIC-PRIVE-NE-PAS-PROJETER';
const privateComment = 'RC4-COMMENTAIRE-PRIVE-NE-PAS-PROJETER';
const privateArbitrationReason = 'RC4-MOTIF-ARBITRAGE-PRIVE-NE-PAS-PROJETER';

let pool: Pool;
let lineId: number;
let operatorId: number;
let maintenanceId: number;
let validPendingId: number;
let nullPendingId: number;
let blankPendingId: number;
let staleOpenId: number;
let lifecycleId: number;

const machines = ['valid', 'null', 'blank', 'stale', 'lifecycle'].map((slot) => ({
  machineId: machineFor(slot),
  brand: 'Board RC4',
  hasDoubleRobot: false,
  robotNumber: 'R01',
  robotHeads: 1,
}));

type IncidentFixture = {
  status: 'OPEN' | 'PENDING';
  waitingReason: string | null;
  diagnostic?: string | null;
  privatePayload?: boolean;
};

async function insertIncident(slot: string, fixture: IncidentFixture): Promise<number> {
  const isPending = fixture.status === 'PENDING';
  const isTaken = isPending || slot === 'lifecycle';
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO workshop_incidents
       (user_id, line_id, line_number, machine_id, machine_brand, robot_label, head_number,
        state, comment, current_product, status, is_taken, is_priority, diagnostic,
        waiting_reason, intervention_note, responsible_comment, cancel_request,
        cancel_request_reason, taken_by_user_id, taken_at, display_order,
        declarant_first_name, declarant_last_name, declarant_role,
        declarant_badge_number, taken_by_first_name, taken_by_last_name, taken_by_role,
        created_at, updated_at)
     VALUES
       ($1, $2, $3, $4, 'Board RC4', 'R01', 1, 'DEGRADEE', $5, $6, $7, $8, FALSE,
        $9, $10, $11, 'Consigne publique RC4', $12, $13, $14,
        ${isTaken ? 'NOW()' : 'NULL'}, $15, 'Identité', 'Privée', 'OPERATOR', $16,
        $17, $18, $19, NOW(), NOW())
     RETURNING id`,
    [
      operatorId,
      lineId,
      lineNumber,
      machineFor(slot),
      fixture.privatePayload ? privateComment : null,
      `PRODUIT-${slot}`,
      fixture.status,
      isTaken,
      fixture.diagnostic ?? null,
      fixture.waitingReason,
      fixture.privatePayload ? 'RC4-NOTE-INTERVENTION-PRIVEE' : null,
      fixture.privatePayload ?? false,
      fixture.privatePayload ? privateArbitrationReason : null,
      isTaken ? maintenanceId : null,
      slot.length,
      operatorBadge,
      isTaken ? 'Technicien' : null,
      isTaken ? 'Privé' : null,
      isTaken ? 'MAINTENANCE' : null,
    ]
  );
  return rows[0].id;
}

function findIncident(board: Awaited<ReturnType<typeof getBoardData>>, incidentId: number) {
  const incident = board.incidents.find((item) => item.id === incidentId);
  expect(incident).toBeDefined();
  return incident!;
}

async function purge(): Promise<void> {
  await pool.query('DELETE FROM workshop_incidents WHERE line_id = $1', [lineId]);
}

beforeAll(async () => {
  pool = new Pool({ connectionString: DB_URL });
  await runMigrations();

  const passwordHash = await hashWorkshopPassword('board_waiting_reason_password');
  const insertUser = async (badge: string, role: 'OPERATOR' | 'MAINTENANCE') => {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO sentinel_users
         (first_name, last_name, badge_number, role, is_active, is_deleted, password_hash)
       VALUES ('RC4', 'Fixture', $1, $2, TRUE, FALSE, $3)
       RETURNING id`,
      [badge, role, passwordHash]
    );
    return rows[0].id;
  };
  operatorId = await insertUser(operatorBadge, 'OPERATOR');
  maintenanceId = await insertUser(maintenanceBadge, 'MAINTENANCE');

  const { rows: lineRows } = await pool.query<{ id: number }>(
    `INSERT INTO production_lines (line_number, machine_sequence, is_active, is_deleted)
     VALUES ($1, $2::jsonb, TRUE, FALSE)
     RETURNING id`,
    [lineNumber, JSON.stringify(machines)]
  );
  lineId = lineRows[0].id;

  validPendingId = await insertIncident('valid', {
    status: 'PENDING',
    waitingReason: exactReason,
    diagnostic: privateDiagnostic,
    privatePayload: true,
  });
  nullPendingId = await insertIncident('null', {
    status: 'PENDING',
    waitingReason: null,
    diagnostic: privateDiagnostic,
  });
  blankPendingId = await insertIncident('blank', {
    status: 'PENDING',
    waitingReason: '     ',
    diagnostic: privateDiagnostic,
  });
  staleOpenId = await insertIncident('stale', {
    status: 'OPEN',
    waitingReason: 'RC4-MOTIF-PERIME-ADVERSARIAL',
    diagnostic: privateDiagnostic,
  });
  lifecycleId = await insertIncident('lifecycle', {
    status: 'OPEN',
    waitingReason: null,
    diagnostic: null,
  });
}, 30_000);

afterAll(async () => {
  await purge();
  await pool.query('DELETE FROM production_lines WHERE id = $1', [lineId]);
  await pool.query('DELETE FROM sentinel_users WHERE id = ANY($1)', [[operatorId, maintenanceId]]);
  await pool.end();
});

describe('projection Board du motif courant de mise en attente (RC4 R4-04)', () => {
  it('projette sans troncature le motif complet d’un incident PENDING', async () => {
    const incident = findIncident(await getBoardData(), validPendingId);

    expect(incident.waiting_reason).toBe(exactReason);
    expect(incident.waiting_reason).toHaveLength(1000);
  });

  it('normalise à null les motifs PENDING nuls ou composés uniquement d’espaces', async () => {
    const board = await getBoardData();

    expect(findIncident(board, nullPendingId).waiting_reason).toBeNull();
    expect(findIncident(board, blankPendingId).waiting_reason).toBeNull();
  });

  it('masque un motif périmé adversarial sur un incident OPEN', async () => {
    expect(findIncident(await getBoardData(), staleOpenId).waiting_reason).toBeNull();
  });

  it('ne prend jamais le diagnostic privé comme repli du motif Board', async () => {
    const board = await getBoardData();

    expect(findIncident(board, nullPendingId).waiting_reason).toBeNull();
    expect(findIncident(board, blankPendingId).waiting_reason).toBeNull();
    expect(findIncident(board, nullPendingId)).not.toHaveProperty('diagnostic');
    expect(JSON.stringify(board)).not.toContain(privateDiagnostic);
  });

  it('suit les vrais services attente/reprise et conserve le motif exact dans l’historique', async () => {
    const pending = await setPendingIncidentService(
      lifecycleId,
      serviceReason,
      maintenanceId,
      'MAINTENANCE'
    );
    expect(pending.ok).toBe(true);
    expect(findIncident(await getBoardData(), lifecycleId)).toMatchObject({
      status: 'PENDING',
      waiting_reason: serviceReason,
    });

    const resumed = await resumeIncidentService(lifecycleId, maintenanceId, 'MAINTENANCE');
    expect(resumed.ok).toBe(true);
    expect(findIncident(await getBoardData(), lifecycleId)).toMatchObject({
      status: 'OPEN',
      waiting_reason: null,
    });

    const { rows: currentRows } = await pool.query<{
      status: string;
      waiting_reason: string | null;
    }>('SELECT status, waiting_reason FROM workshop_incidents WHERE id = $1', [lifecycleId]);
    expect(currentRows[0]).toEqual({ status: 'OPEN', waiting_reason: null });

    const { rows: events } = await pool.query<{
      event_type: string;
      payload: Record<string, unknown> | null;
    }>(
      `SELECT event_type, payload
       FROM workshop_incident_events
       WHERE incident_id = $1
         AND event_type IN ('INCIDENT_SET_PENDING', 'INCIDENT_RESUMED')
       ORDER BY id ASC`,
      [lifecycleId]
    );
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      event_type: 'INCIDENT_SET_PENDING',
      payload: { waitingReason: serviceReason },
    });
    expect(events[1]).toMatchObject({
      event_type: 'INCIDENT_RESUMED',
      payload: { waitingReason: serviceReason },
    });
  });

  it('reste strictement en lecture seule sur les lignes et leurs événements', async () => {
    const snapshot = async () => {
      const { rows } = await pool.query(
        `SELECT id, xmin::text AS row_version, status, waiting_reason, diagnostic, updated_at
         FROM workshop_incidents
         WHERE line_id = $1
         ORDER BY id ASC`,
        [lineId]
      );
      const { rows: eventCounts } = await pool.query(
        `SELECT incident_id, COUNT(*)::int AS count
         FROM workshop_incident_events
         WHERE incident_id IN (SELECT id FROM workshop_incidents WHERE line_id = $1)
         GROUP BY incident_id
         ORDER BY incident_id ASC`,
        [lineId]
      );
      return { rows, eventCounts };
    };

    const before = await snapshot();
    await getBoardData();
    const after = await snapshot();

    expect(after).toEqual(before);
  });

  it('ajoute uniquement waiting_reason aux 17 clés publiques existantes', async () => {
    const board = await getBoardData();
    const privateSource = findIncident(board, validPendingId);
    const expectedKeys = [
      'created_at',
      'current_product',
      'display_order',
      'has_cancel_arbitration',
      'has_edit_arbitration',
      'head_number',
      'id',
      'is_priority',
      'is_taken',
      'line_id',
      'line_number',
      'machine_id',
      'responsible_comment',
      'robot_label',
      'state',
      'status',
      'updated_at',
      'waiting_reason',
    ];
    const forbiddenKeys = [
      'arbitration',
      'badge_number',
      'cancel_request',
      'cancel_request_reason',
      'comment',
      'decision_reason',
      'diagnostic',
      'edit_request',
      'first_name',
      'history',
      'intervention_note',
      'last_name',
      'permissions',
      'role',
      'taken_by_first_name',
      'taken_by_last_name',
      'taken_by_role',
      'taken_by_user_id',
      'user_id',
    ];

    expect(Object.keys(board).sort()).toEqual(['incidents', 'lines', 'metrics']);
    expect(Object.keys(board.lines.find((line) => line.id === lineId)!).sort()).toEqual([
      'id',
      'line_number',
    ]);
    expect(Object.keys(board.metrics).sort()).toEqual(['open', 'open_over_7d', 'pending', 'total']);
    expect(Object.keys(privateSource).sort()).toEqual(expectedKeys);
    for (const key of forbiddenKeys) expect(privateSource).not.toHaveProperty(key);
    expect(JSON.stringify(privateSource)).not.toContain(privateComment);
    expect(JSON.stringify(privateSource)).not.toContain(privateDiagnostic);
    expect(JSON.stringify(privateSource)).not.toContain(privateArbitrationReason);
  });
});
