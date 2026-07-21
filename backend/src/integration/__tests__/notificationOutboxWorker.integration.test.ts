/**
 * Preuves PostgreSQL réelles du worker d'outbox (pas seulement son
 * repository) : claim → livraison réelle multi-canal → statut terminal
 * persisté, contre une base réelle et un incident réel (lot 10, TEST-04).
 *
 * SMTP n'est jamais configuré en test (SMTP_HOST absent) : chaque canal se
 * dégrade en SKIPPED_DISABLED sans toucher le réseau, ce qui rend le test
 * déterministe tout en exerçant le vrai chemin claim/deliver/complete.
 */

import { Pool } from 'pg';
import runMigrations from '../../db/migrate';
import { hashWorkshopPassword } from '../../auth/bcrypt';
import { createIncidentService } from '../../modules/workshop/workshop.service.edit';
import { takeIncidentService } from '../../modules/workshop/workshop.service.mutations';
import { processNotificationOutboxBatch } from '../../modules/notifications/notificationOutbox.worker';

const DB_URL = process.env.DATABASE_URL!;
const fixtureSuffix = `${process.pid}${Date.now()}`;
const LINE_NUMBER = `95${fixtureSuffix}`.slice(0, 9);
const OPERATOR_BADGE = `9501${fixtureSuffix}`.slice(0, 9);
const MAINTENANCE_BADGE = `9502${fixtureSuffix}`.slice(0, 9);

let pool: Pool;
let lineId: number;
let operatorId: number;
let maintenanceId: number;

beforeAll(async () => {
  pool = new Pool({ connectionString: DB_URL });
  await runMigrations();

  const machines = [
    {
      machineId: 'M-OUTBOX-01',
      brand: 'Fanuc',
      hasDoubleRobot: false,
      robotNumber: 'R01',
      robotHeads: 1,
    },
  ];
  const { rows: lineRows } = await pool.query<{ id: number }>(
    `INSERT INTO production_lines (line_number, machine_sequence, is_active, is_deleted)
     VALUES ($1, $2::jsonb, TRUE, FALSE)
     RETURNING id`,
    [LINE_NUMBER, JSON.stringify(machines)]
  );
  lineId = lineRows[0].id;

  const hash = await hashWorkshopPassword('outbox_worker_integration_password');
  const upsertUser = async (badge: string, role: string): Promise<number> => {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO sentinel_users (first_name, last_name, badge_number, role, is_active, is_deleted, password_hash)
       VALUES ('Outbox', 'Worker', $1, $2, TRUE, FALSE, $3)
       RETURNING id`,
      [badge, role, hash]
    );
    return rows[0].id;
  };
  operatorId = await upsertUser(OPERATOR_BADGE, 'OPERATOR');
  maintenanceId = await upsertUser(MAINTENANCE_BADGE, 'MAINTENANCE');
}, 30_000);

afterEach(async () => {
  await pool.query(
    `DELETE FROM notification_outbox
     WHERE source_event_id IN (
       SELECT id FROM workshop_incident_events
       WHERE incident_id IN (SELECT id FROM workshop_incidents WHERE line_id = $1)
     )`,
    [lineId]
  );
  await pool.query(
    `DELETE FROM workshop_incident_events WHERE incident_id IN (SELECT id FROM workshop_incidents WHERE line_id = $1)`,
    [lineId]
  );
  await pool.query(`DELETE FROM workshop_incidents WHERE line_id = $1`, [lineId]);
});

afterAll(async () => {
  await pool.query('DELETE FROM sentinel_users WHERE id IN ($1, $2)', [operatorId, maintenanceId]);
  await pool.query('DELETE FROM production_lines WHERE id = $1', [lineId]);
  await pool.end();
});

async function createAndTakeIncident(): Promise<number> {
  const created = await createIncidentService(
    {
      lineId,
      machineId: 'M-OUTBOX-01',
      robotLabel: 'R01',
      headNumber: 1,
      state: 'DEGRADEE',
      currentProduct: 'REF-OUTBOX',
    },
    operatorId,
    'OPERATOR'
  );
  if (!created.ok) throw new Error(`createIncidentService failed: ${JSON.stringify(created)}`);
  const incidentId = (created.data as { id: number }).id;

  const taken = await takeIncidentService(incidentId, maintenanceId, 'MAINTENANCE');
  if (!taken.ok) throw new Error(`takeIncidentService failed: ${JSON.stringify(taken)}`);

  return incidentId;
}

describe('notification outbox worker — preuves PostgreSQL bout-en-bout (lot 10, TEST-04)', () => {
  it('un événement INCIDENT_TAKEN réel produit un item d’outbox que le worker réclame et complète', async () => {
    const incidentId = await createAndTakeIncident();

    const { rows: beforeRows } = await pool.query<{ status: string }>(
      `SELECT status FROM notification_outbox
       WHERE source_event_id IN (
         SELECT id FROM workshop_incident_events
         WHERE incident_id = $1 AND event_type = 'INCIDENT_TAKEN'
       )`,
      [incidentId]
    );
    expect(beforeRows).toHaveLength(1);
    expect(beforeRows[0].status).toBe('PENDING');

    const processed = await processNotificationOutboxBatch(10, 5);
    expect(processed).toBeGreaterThanOrEqual(1);

    const { rows: afterRows } = await pool.query<{
      status: string;
      completed_at: Date | null;
      delivered_recipients: Record<string, string[]>;
    }>(
      `SELECT status, completed_at, delivered_recipients FROM notification_outbox
       WHERE source_event_id IN (
         SELECT id FROM workshop_incident_events
         WHERE incident_id = $1 AND event_type = 'INCIDENT_TAKEN'
       )`,
      [incidentId]
    );
    expect(afterRows).toHaveLength(1);
    // Ni erreur ni SENT : le fixture n'a ni email déclarant ni suiveur, donc
    // les deux canaux (followers, déclarant) atterrissent en
    // SKIPPED_NO_RECIPIENT — jamais SMTP n'est atteint (SMTP_HOST absent).
    expect(afterRows[0].status).toBe('SKIPPED_NO_RECIPIENT');
    expect(afterRows[0].completed_at).not.toBeNull();
  });

  it('un item déjà traité (aucun PENDING) laisse processNotificationOutboxBatch à zéro sans erreur', async () => {
    await createAndTakeIncident();
    await processNotificationOutboxBatch(10, 5);

    const secondPass = await processNotificationOutboxBatch(10, 5);
    expect(secondPass).toBe(0);
  });

  it('un event_type non géré par le worker est classé FAILED en une tentative, jamais laissé PENDING (permanent error)', async () => {
    const incidentId = await createAndTakeIncident();
    // NOTIFIABLE_INCIDENT_EVENTS et le switch de deliverNotificationOutboxItem
    // doivent rester synchronisés ; ce test simule leur dérive en insérant
    // manuellement un item pour un event_type que le worker ne gère pas
    // (contournement volontaire de enqueueIncidentNotification, qui ne
    // l'aurait jamais laissé passer en fonctionnement normal).
    const { rows: eventRows } = await pool.query<{ id: number }>(
      `INSERT INTO workshop_incident_events (incident_id, actor_user_id, event_type, payload)
       VALUES ($1, $2, 'INCIDENT_UPDATED', '{}'::jsonb)
       RETURNING id`,
      [incidentId, maintenanceId]
    );
    const { rows: outboxRows } = await pool.query<{ id: string }>(
      `INSERT INTO notification_outbox (source_event_id) VALUES ($1) RETURNING id::text`,
      [eventRows[0].id]
    );

    await processNotificationOutboxBatch(10, 5);

    const { rows: statusRows } = await pool.query<{ status: string; attempt_count: number }>(
      `SELECT status, attempt_count FROM notification_outbox WHERE id = $1`,
      [outboxRows[0].id]
    );
    expect(statusRows[0].status).toBe('FAILED');
    expect(statusRows[0].attempt_count).toBe(1);
  });
});
