/**
 * Integration test for the cancellation arbitration lifecycle (RC3, lot 5),
 * against a real PostgreSQL database.
 *
 * Proves:
 *  - the requester (and only the requester) can withdraw their own pending
 *    cancellation request; a CANCEL_REQUEST_WITHDRAWN event is written and the
 *    incident stays active;
 *  - another operator cannot withdraw someone else's request (forbidden);
 *  - rejecting a cancellation requires a reason (empty/blank refused), and a
 *    valid rejection records the reason on the event and the arbitration case;
 *  - concurrency: when a withdrawal and a rejection race on the same request,
 *    exactly one wins and the other fails — the request is resolved once.
 */

import { Pool } from 'pg';
import runMigrations from '../../db/migrate';
import { hashWorkshopPassword } from '../../auth/bcrypt';
import { createIncidentService } from '../../modules/workshop/workshop.service.edit';
import {
  requestCancelIncidentService,
  rejectCancelIncidentService,
  withdrawCancelIncidentService,
  cancelIncidentService,
} from '../../modules/workshop/workshop.service.mutations';
import type { ServiceResult } from '../../utils/serviceResult';

const DB_URL = process.env.DATABASE_URL!;

let pool: Pool;
let lineId: number;
let operatorId: number;
let otherOperatorId: number;
let responsableId: number;

const LINE_NUMBER = '991';
const machines = [
  {
    machineId: 'M-CANC-01',
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

async function lastEventType(incidentId: number): Promise<string | null> {
  const { rows } = await pool.query<{ event_type: string }>(
    `SELECT event_type FROM workshop_incident_events
     WHERE incident_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
    [incidentId]
  );
  return rows[0]?.event_type ?? null;
}

async function createIncidentWithCancelRequest(): Promise<number> {
  const created = assertOk(
    await createIncidentService(
      {
        lineId,
        machineId: 'M-CANC-01',
        robotLabel: 'R01',
        headNumber: 1,
        state: 'DEGRADEE',
        currentProduct: 'REF-A',
      },
      operatorId,
      'OPERATOR'
    )
  ) as { id: number };
  assertOk(
    await requestCancelIncidentService(
      created.id,
      'Doublon de signalement.',
      operatorId,
      'OPERATOR'
    )
  );
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

  const hash = await hashWorkshopPassword('canc_test_pass_99');
  const upsertUser = async (badge: string, role: string): Promise<number> => {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO sentinel_users (first_name, last_name, badge_number, role, is_active, is_deleted, password_hash)
       VALUES ('Canc', 'User', $1, $2, TRUE, FALSE, $3)
       ON CONFLICT (badge_number) WHERE is_deleted = FALSE DO UPDATE SET password_hash = EXCLUDED.password_hash
       RETURNING id`,
      [badge, role, hash]
    );
    return rows[0].id;
  };
  operatorId = await upsertUser('9910201', 'OPERATOR');
  otherOperatorId = await upsertUser('9910202', 'OPERATOR');
  responsableId = await upsertUser('9910203', 'RESPONSABLE');
}, 30_000);

async function purge(): Promise<void> {
  const sel = 'SELECT id FROM workshop_incidents WHERE line_id = $1';
  await pool.query(
    `DELETE FROM notification_outbox WHERE source_event_id IN (
       SELECT e.id FROM workshop_incident_events e JOIN workshop_incidents i ON i.id = e.incident_id
       WHERE i.line_id = $1)`,
    [lineId]
  );
  await pool.query(`DELETE FROM workshop_arbitration_cases WHERE incident_id IN (${sel})`, [
    lineId,
  ]);
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
  await pool.query('DELETE FROM sentinel_users WHERE id = ANY($1)', [
    [operatorId, otherOperatorId, responsableId],
  ]);
  await pool.end();
});

describe('cycle d’annulation — retrait, refus, concurrence (lot 5, PostgreSQL réel)', () => {
  it('le demandeur retire sa propre demande : événement CANCEL_REQUEST_WITHDRAWN, incident actif', async () => {
    const incidentId = await createIncidentWithCancelRequest();
    assertOk(await withdrawCancelIncidentService(incidentId, operatorId, 'OPERATOR'));

    expect(await lastEventType(incidentId)).toBe('CANCEL_REQUEST_WITHDRAWN');
    const { rows } = await pool.query<{ status: string; cancel_request: boolean }>(
      'SELECT status, cancel_request FROM workshop_incidents WHERE id = $1',
      [incidentId]
    );
    expect(rows[0].status).toBe('OPEN');
    expect(rows[0].cancel_request).toBe(false);
  });

  it('un AUTRE opérateur ne peut pas retirer la demande d’autrui (forbidden)', async () => {
    const incidentId = await createIncidentWithCancelRequest();
    const result = await withdrawCancelIncidentService(incidentId, otherOperatorId, 'OPERATOR');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
    // La demande reste ouverte (aucun retrait).
    const { rows } = await pool.query<{ cancel_request: boolean }>(
      'SELECT cancel_request FROM workshop_incidents WHERE id = $1',
      [incidentId]
    );
    expect(rows[0].cancel_request).toBe(true);
  });

  it('le refus d’annulation exige un motif (vide et espaces refusés)', async () => {
    const incidentId = await createIncidentWithCancelRequest();
    expect(
      (await rejectCancelIncidentService(incidentId, responsableId, 'RESPONSABLE', '')).ok
    ).toBe(false);
    expect(
      (await rejectCancelIncidentService(incidentId, responsableId, 'RESPONSABLE', '   ')).ok
    ).toBe(false);
    // Toujours en attente : aucun refus enregistré.
    const { rows } = await pool.query<{ cancel_request: boolean }>(
      'SELECT cancel_request FROM workshop_incidents WHERE id = $1',
      [incidentId]
    );
    expect(rows[0].cancel_request).toBe(true);
  });

  it('un refus valide enregistre le motif sur l’événement et l’arbitrage', async () => {
    const incidentId = await createIncidentWithCancelRequest();
    assertOk(
      await rejectCancelIncidentService(incidentId, responsableId, 'RESPONSABLE', 'Incident réel.')
    );
    const { rows: eventRows } = await pool.query<{ payload: Record<string, unknown> }>(
      `SELECT payload FROM workshop_incident_events
       WHERE incident_id = $1 AND event_type = 'CANCEL_REQUEST_REJECTED' ORDER BY id DESC LIMIT 1`,
      [incidentId]
    );
    expect(eventRows[0].payload.decisionReason).toBe('Incident réel.');
    const { rows: caseRows } = await pool.query<{ decision_reason: string; status: string }>(
      `SELECT decision_reason, status FROM workshop_arbitration_cases
       WHERE incident_id = $1 AND request_type = 'CANCEL' ORDER BY id DESC LIMIT 1`,
      [incidentId]
    );
    expect(caseRows[0].status).toBe('REJECTED');
    expect(caseRows[0].decision_reason).toBe('Incident réel.');
  });

  it('concurrence : retrait et refus simultanés — un seul gagne, la demande est résolue une fois', async () => {
    const incidentId = await createIncidentWithCancelRequest();
    const [withdraw, reject] = await Promise.allSettled([
      withdrawCancelIncidentService(incidentId, operatorId, 'OPERATOR'),
      rejectCancelIncidentService(incidentId, responsableId, 'RESPONSABLE', 'Incident réel.'),
    ]);
    const okCount = [withdraw, reject].filter((r) => r.status === 'fulfilled' && r.value.ok).length;
    // Exactement un gagnant : la seconde opération ne trouve plus de demande ouverte.
    expect(okCount).toBe(1);
    const { rows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM workshop_arbitration_cases
       WHERE incident_id = $1 AND status IN ('ACTIVE', 'CONSULTED')`,
      [incidentId]
    );
    expect(Number(rows[0].count)).toBe(0);
  });

  // ─── Course 1 : retrait contre confirmation de l'annulation ─────────────────

  it('concurrence : retrait vs confirmation — un seul gagne, aucun état contradictoire', async () => {
    // Répété plusieurs fois pour couvrir les deux ordonnancements possibles.
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const incidentId = await createIncidentWithCancelRequest();
      const [withdraw, confirm] = await Promise.allSettled([
        withdrawCancelIncidentService(incidentId, operatorId, 'OPERATOR'),
        cancelIncidentService(incidentId, responsableId, 'RESPONSABLE', 'approve'),
      ]);
      const withdrawOk = withdraw.status === 'fulfilled' && withdraw.value.ok;
      const confirmOk = confirm.status === 'fulfilled' && confirm.value.ok;
      // Aucune des deux ne rejette (throw) : les deux se règlent en résultat métier.
      expect(withdraw.status).toBe('fulfilled');
      expect(confirm.status).toBe('fulfilled');
      // Exactement un gagnant.
      expect([withdrawOk, confirmOk].filter(Boolean)).toHaveLength(1);

      const { rows } = await pool.query<{ status: string; cancel_request: boolean }>(
        'SELECT status, cancel_request FROM workshop_incidents WHERE id = $1',
        [incidentId]
      );
      const cancelEvents = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM workshop_incident_events
         WHERE incident_id = $1 AND event_type = 'INCIDENT_CANCELED'`,
        [incidentId]
      );
      if (confirmOk) {
        // La confirmation gagne : incident annulé, exactement un événement d'annulation.
        expect(rows[0].status).toBe('CANCELED');
        expect(Number(cancelEvents.rows[0].count)).toBe(1);
      } else {
        // Le retrait gagne : incident actif, AUCUNE annulation finale produite.
        expect(rows[0].status).toBe('OPEN');
        expect(rows[0].cancel_request).toBe(false);
        expect(Number(cancelEvents.rows[0].count)).toBe(0);
      }
      // Dans tous les cas, plus aucun arbitrage ouvert (résolu une seule fois).
      const openCases = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM workshop_arbitration_cases
         WHERE incident_id = $1 AND status IN ('ACTIVE', 'CONSULTED')`,
        [incidentId]
      );
      expect(Number(openCases.rows[0].count)).toBe(0);
      await purge();
    }
  });

  // ─── Course 2 : deux retraits simultanés ────────────────────────────────────

  it('concurrence : deux retraits simultanés — un seul succès, un seul événement, aucun 500', async () => {
    const incidentId = await createIncidentWithCancelRequest();
    const [a, b] = await Promise.allSettled([
      withdrawCancelIncidentService(incidentId, operatorId, 'OPERATOR'),
      withdrawCancelIncidentService(incidentId, operatorId, 'OPERATOR'),
    ]);
    // Aucune des deux ne lève : la seconde reçoit un résultat métier stable (≠ 500).
    expect(a.status).toBe('fulfilled');
    expect(b.status).toBe('fulfilled');
    const results = [a, b].map((r) => (r as PromiseFulfilledResult<ServiceResult<unknown>>).value);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const loser = results.find((r) => !r.ok);
    if (loser && !loser.ok) expect(loser.status).toBeLessThan(500);

    // Un seul événement de retrait.
    const events = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM workshop_incident_events
       WHERE incident_id = $1 AND event_type = 'CANCEL_REQUEST_WITHDRAWN'`,
      [incidentId]
    );
    expect(Number(events.rows[0].count)).toBe(1);
    // Aucun doublon d'outbox (le retrait n'est pas notifiable, donc 0).
    const outbox = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM notification_outbox o
       JOIN workshop_incident_events e ON e.id = o.source_event_id
       WHERE e.incident_id = $1 AND e.event_type = 'CANCEL_REQUEST_WITHDRAWN'`,
      [incidentId]
    );
    expect(Number(outbox.rows[0].count)).toBe(0);
  });

  // ─── Course 3 : décision finale d'annulation (conservation + Historique) ────

  it('confirmation finale : conserve motif initial, décision, acteur, horodatage, et reste dans l’Historique', async () => {
    const incidentId = await createIncidentWithCancelRequest();
    assertOk(await cancelIncidentService(incidentId, responsableId, 'RESPONSABLE', 'approve'));

    // Événement INCIDENT_CANCELED : motif initial conservé + mode d'approbation.
    const { rows: eventRows } = await pool.query<{ payload: Record<string, unknown> }>(
      `SELECT payload FROM workshop_incident_events
       WHERE incident_id = $1 AND event_type = 'INCIDENT_CANCELED' ORDER BY id DESC LIMIT 1`,
      [incidentId]
    );
    expect(eventRows[0].payload.requestedReason).toBe('Doublon de signalement.');
    expect(eventRows[0].payload.mode).toBe('request_approved');

    // Arbitrage : décision, acteur et horodatage conservés.
    const { rows: caseRows } = await pool.query<{
      status: string;
      decided_by_user_id: number | null;
      decided_at: Date | null;
    }>(
      `SELECT status, decided_by_user_id, decided_at FROM workshop_arbitration_cases
       WHERE incident_id = $1 AND request_type = 'CANCEL' ORDER BY id DESC LIMIT 1`,
      [incidentId]
    );
    expect(caseRows[0].status).toBe('APPROVED');
    expect(caseRows[0].decided_by_user_id).toBe(responsableId);
    expect(caseRows[0].decided_at).not.toBeNull();

    // Incident annulé mais toujours consultable dans l'Historique.
    const { rows: incRows } = await pool.query<{ status: string }>(
      'SELECT status FROM workshop_incidents WHERE id = $1',
      [incidentId]
    );
    expect(incRows[0].status).toBe('CANCELED');
    const history = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM workshop_incident_events WHERE incident_id = $1`,
      [incidentId]
    );
    expect(Number(history.rows[0].count)).toBeGreaterThan(0);
  });
});
