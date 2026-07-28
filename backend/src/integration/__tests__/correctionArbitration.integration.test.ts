/**
 * Integration test for the correction arbitration contract (RC3, lot 4), against
 * a real PostgreSQL database.
 *
 * Proves the end-to-end contract that unit tests with mocks cannot:
 *  - a correction request writes a versioned event (schemaVersion 2) whose
 *    before is snapshotted from the row at request time;
 *  - rejecting without a reason (or with a blank reason) is refused, and nothing
 *    is written;
 *  - a valid rejection keeps EXACTLY the requested diff, records the decision
 *    reason on the event and the arbitration case, and enqueues a notification;
 *  - applying keeps the same before -> after diff and references the request.
 */

import { Pool } from 'pg';
import runMigrations from '../../db/migrate';
import { hashWorkshopPassword } from '../../auth/bcrypt';
import {
  createIncidentService,
  requestEditIncidentService,
  approveEditIncidentService,
  rejectEditIncidentService,
  withdrawEditRequestService,
} from '../../modules/workshop/workshop.service.edit';
import type { ServiceResult } from '../../utils/serviceResult';

const DB_URL = process.env.DATABASE_URL!;

let pool: Pool;
let lineId: number;
let operatorId: number;
let responsableId: number;

const LINE_NUMBER = '990';
const machines = [
  {
    machineId: 'M-CORR-01',
    brand: 'Fanuc',
    hasDoubleRobot: false,
    robotNumber: 'R01',
    robotHeads: 4,
  },
];

function assertOk<T>(result: ServiceResult<T>): T {
  if (!result.ok) throw new Error(`Expected ok but got: ${JSON.stringify(result)}`);
  return result.data;
}

async function eventPayload(
  incidentId: number,
  eventType: string
): Promise<Record<string, unknown> | null> {
  const { rows } = await pool.query<{ payload: Record<string, unknown> | null }>(
    `SELECT payload FROM workshop_incident_events
     WHERE incident_id = $1 AND event_type = $2 ORDER BY created_at DESC LIMIT 1`,
    [incidentId, eventType]
  );
  return rows[0]?.payload ?? null;
}

async function createIncident(): Promise<number> {
  const created = assertOk(
    await createIncidentService(
      {
        lineId,
        machineId: 'M-CORR-01',
        robotLabel: 'R01',
        headNumber: 1,
        state: 'DEGRADEE',
        currentProduct: 'REF-A',
      },
      operatorId,
      'OPERATOR'
    )
  ) as { id: number };
  return created.id;
}

beforeAll(async () => {
  pool = new Pool({ connectionString: DB_URL });
  await runMigrations();

  const { rows: lineRows } = await pool.query<{ id: number }>(
    `INSERT INTO production_lines (line_number, machine_sequence, is_active, is_deleted)
     VALUES ($1, $2::jsonb, TRUE, FALSE)
     ON CONFLICT DO NOTHING RETURNING id`,
    [LINE_NUMBER, JSON.stringify(machines)]
  );
  lineId =
    lineRows.length > 0
      ? lineRows[0].id
      : (
          await pool.query<{ id: number }>(
            'SELECT id FROM production_lines WHERE line_number = $1',
            [LINE_NUMBER]
          )
        ).rows[0].id;

  const hash = await hashWorkshopPassword('corr_test_pass_99');
  const upsertUser = async (badge: string, role: string): Promise<number> => {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO sentinel_users (first_name, last_name, badge_number, role, is_active, is_deleted, password_hash)
       VALUES ('Corr', 'User', $1, $2, TRUE, FALSE, $3)
       ON CONFLICT (badge_number) WHERE is_deleted = FALSE DO UPDATE SET password_hash = EXCLUDED.password_hash
       RETURNING id`,
      [badge, role, hash]
    );
    return rows[0].id;
  };
  operatorId = await upsertUser('9900201', 'OPERATOR');
  responsableId = await upsertUser('9900203', 'RESPONSABLE');
}, 30_000);

async function purgeIncidents(): Promise<void> {
  const incidentSelector = 'SELECT id FROM workshop_incidents WHERE line_id = $1';
  // Ordre respectant les clés étrangères : outbox → events/followers/arbitrage → incidents.
  await pool.query(
    `DELETE FROM notification_outbox
     WHERE source_event_id IN (
       SELECT e.id FROM workshop_incident_events e
       JOIN workshop_incidents i ON i.id = e.incident_id
       WHERE i.line_id = $1
     )`,
    [lineId]
  );
  await pool.query(
    `DELETE FROM workshop_arbitration_cases WHERE incident_id IN (${incidentSelector})`,
    [lineId]
  );
  await pool.query(
    `DELETE FROM workshop_incident_followers WHERE incident_id IN (${incidentSelector})`,
    [lineId]
  );
  await pool.query(
    `DELETE FROM workshop_incident_events WHERE incident_id IN (${incidentSelector})`,
    [lineId]
  );
  await pool.query('DELETE FROM workshop_incidents WHERE line_id = $1', [lineId]);
}

afterEach(async () => {
  await purgeIncidents();
});

afterAll(async () => {
  await purgeIncidents();
  await pool.query('DELETE FROM production_lines WHERE id = $1', [lineId]);
  await pool.query('DELETE FROM sentinel_users WHERE id = ANY($1)', [[operatorId, responsableId]]);
  await pool.end();
});

describe('arbitrage de correction — contrat de traçabilité (lot 4, PostgreSQL réel)', () => {
  it('la demande écrit un événement versionné (schemaVersion 2) avec before/after snapshoté', async () => {
    const incidentId = await createIncident();
    assertOk(
      await requestEditIncidentService(
        incidentId,
        { state: 'INDISPONIBLE', currentProduct: 'REF-B' },
        operatorId,
        'OPERATOR'
      )
    );
    const payload = await eventPayload(incidentId, 'EDIT_REQUESTED');
    expect(payload?.schemaVersion).toBe(2);
    expect(payload?.changes).toEqual({
      state: { before: 'DEGRADEE', after: 'INDISPONIBLE' },
      currentProduct: { before: 'REF-A', after: 'REF-B' },
    });
  });

  it('refuse un refus SANS motif et un refus composé uniquement d’espaces', async () => {
    const incidentId = await createIncident();
    assertOk(
      await requestEditIncidentService(
        incidentId,
        { state: 'INDISPONIBLE' },
        operatorId,
        'OPERATOR'
      )
    );

    const noReason = await rejectEditIncidentService(incidentId, responsableId, 'RESPONSABLE', '');
    expect(noReason.ok).toBe(false);
    const blank = await rejectEditIncidentService(incidentId, responsableId, 'RESPONSABLE', '   ');
    expect(blank.ok).toBe(false);

    // Rien n'a été écrit : aucun EDIT_REJECTED, la demande est toujours ouverte.
    expect(await eventPayload(incidentId, 'EDIT_REJECTED')).toBeNull();
  });

  it('un refus valide conserve le diff de la demande, le motif et enfile une notification', async () => {
    const incidentId = await createIncident();
    assertOk(
      await requestEditIncidentService(
        incidentId,
        { state: 'INDISPONIBLE', currentProduct: 'REF-B' },
        operatorId,
        'OPERATOR'
      )
    );
    assertOk(
      await rejectEditIncidentService(
        incidentId,
        responsableId,
        'RESPONSABLE',
        'Valeurs incohérentes avec le relevé.'
      )
    );

    const rejected = await eventPayload(incidentId, 'EDIT_REJECTED');
    expect(rejected?.schemaVersion).toBe(2);
    expect(rejected?.changes).toEqual({
      state: { before: 'DEGRADEE', after: 'INDISPONIBLE' },
      currentProduct: { before: 'REF-A', after: 'REF-B' },
    });
    expect(rejected?.decisionReason).toBe('Valeurs incohérentes avec le relevé.');
    expect(typeof rejected?.requestEventId).toBe('number');

    // Le motif est aussi persisté sur le dossier d'arbitrage.
    const { rows: caseRows } = await pool.query<{ decision_reason: string | null; status: string }>(
      `SELECT decision_reason, status FROM workshop_arbitration_cases
       WHERE incident_id = $1 AND request_type = 'EDIT' ORDER BY id DESC LIMIT 1`,
      [incidentId]
    );
    expect(caseRows[0].status).toBe('REJECTED');
    expect(caseRows[0].decision_reason).toBe('Valeurs incohérentes avec le relevé.');

    // Une notification a été enfilée dans l'outbox, rattachée à un événement de
    // cet incident (l'outbox référence l'incident via source_event_id).
    const { rows: outbox } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM notification_outbox o
       JOIN workshop_incident_events e ON e.id = o.source_event_id
       WHERE e.incident_id = $1`,
      [incidentId]
    );
    expect(Number(outbox[0].count)).toBeGreaterThan(0);
  });

  it('l’application conserve exactement le même avant → après que la demande', async () => {
    const incidentId = await createIncident();
    assertOk(
      await requestEditIncidentService(
        incidentId,
        { state: 'INDISPONIBLE', currentProduct: 'REF-B' },
        operatorId,
        'OPERATOR'
      )
    );
    const requested = await eventPayload(incidentId, 'EDIT_REQUESTED');
    assertOk(await approveEditIncidentService(incidentId, responsableId, 'RESPONSABLE'));

    const applied = await eventPayload(incidentId, 'EDIT_APPLIED');
    expect(applied?.schemaVersion).toBe(2);
    // Même diff que la demande (avant → après identiques), pas recalculé.
    expect(applied?.changes).toEqual(requested?.changes);
    expect(typeof applied?.requestEventId).toBe('number');
  });

  it('le demandeur retire sa correction, jamais un autre utilisateur', async () => {
    const incidentId = await createIncident();
    assertOk(
      await requestEditIncidentService(
        incidentId,
        { state: 'INDISPONIBLE', currentProduct: 'REF-B' },
        operatorId,
        'OPERATOR'
      )
    );

    const forbidden = await withdrawEditRequestService(incidentId, responsableId, 'RESPONSABLE');
    expect(forbidden.ok).toBe(false);
    expect(await eventPayload(incidentId, 'EDIT_REQUEST_WITHDRAWN')).toBeNull();

    assertOk(await withdrawEditRequestService(incidentId, operatorId, 'OPERATOR'));
    const withdrawn = await eventPayload(incidentId, 'EDIT_REQUEST_WITHDRAWN');
    expect(withdrawn?.schemaVersion).toBe(2);
    expect(withdrawn?.changes).toEqual({
      state: { before: 'DEGRADEE', after: 'INDISPONIBLE' },
      currentProduct: { before: 'REF-A', after: 'REF-B' },
    });

    const { rows } = await pool.query<{
      edit_request: Record<string, unknown> | null;
      status: string;
    }>(
      `SELECT i.edit_request, c.status
       FROM workshop_incidents i
       JOIN workshop_arbitration_cases c ON c.incident_id = i.id
       WHERE i.id = $1 AND c.request_type = 'EDIT'
       ORDER BY c.id DESC LIMIT 1`,
      [incidentId]
    );
    expect(rows[0]).toEqual({ edit_request: null, status: 'WITHDRAWN' });
  });

  it('deux arbitrages concurrents produisent exactement un gagnant et une décision', async () => {
    const incidentId = await createIncident();
    assertOk(
      await requestEditIncidentService(
        incidentId,
        { state: 'INDISPONIBLE', currentProduct: 'REF-B' },
        operatorId,
        'OPERATOR'
      )
    );

    const results = await Promise.all([
      approveEditIncidentService(incidentId, responsableId, 'RESPONSABLE'),
      rejectEditIncidentService(
        incidentId,
        responsableId,
        'RESPONSABLE',
        'Refus concurrent documenté.'
      ),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);

    const { rows: decisionEvents } = await pool.query<{ event_type: string }>(
      `SELECT event_type
       FROM workshop_incident_events
       WHERE incident_id = $1 AND event_type IN ('EDIT_APPLIED', 'EDIT_REJECTED')`,
      [incidentId]
    );
    expect(decisionEvents).toHaveLength(1);
    expect(['EDIT_APPLIED', 'EDIT_REJECTED']).toContain(decisionEvents[0].event_type);

    const { rows: cases } = await pool.query<{ status: string }>(
      `SELECT status
       FROM workshop_arbitration_cases
       WHERE incident_id = $1 AND request_type = 'EDIT'`,
      [incidentId]
    );
    expect(cases).toHaveLength(1);
    expect(['APPROVED', 'REJECTED']).toContain(cases[0].status);
  });
});
