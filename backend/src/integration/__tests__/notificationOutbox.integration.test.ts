/**
 * Preuves PostgreSQL réelles du lot 5A : leases récupérés au-delà du
 * démarrage, et distinction des issues terminales (COMPLETED vs
 * SKIPPED_DISABLED / SKIPPED_NO_RECIPIENT) au niveau du contrat SQL.
 */

import { Pool } from 'pg';
import runMigrations from '../../db/migrate';
import { hashWorkshopPassword } from '../../auth/bcrypt';
import {
  claimNotificationOutboxItems,
  completeNotificationOutboxItem,
  recoverStaleNotificationOutboxItems,
  retryOrFailNotificationOutboxItem,
} from '../../modules/notifications/notificationOutbox.repository';

const DB_URL = process.env.DATABASE_URL!;
const fixtureSuffix = `${process.pid}${Date.now()}`;
const badgeNumber = `95${fixtureSuffix}1`;

let pool: Pool;
let userId: number;

async function insertPasswordResetOutboxItem(): Promise<string> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO password_reset_requests (user_id, badge_number) VALUES ($1, $2) RETURNING id`,
    [userId, badgeNumber]
  );
  const requestId = rows[0].id;
  const { rows: outboxRows } = await pool.query<{ id: string }>(
    `INSERT INTO notification_outbox (password_reset_request_id)
     VALUES ($1)
     RETURNING id::text`,
    [requestId]
  );
  return outboxRows[0].id;
}

beforeAll(async () => {
  pool = new Pool({ connectionString: DB_URL });
  await runMigrations();

  const passwordHash = await hashWorkshopPassword('outbox_integration_password');
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO sentinel_users
       (first_name, last_name, badge_number, role, is_active, is_deleted, password_hash)
     VALUES ('Outbox', 'Fixture', $1, 'OPERATOR', TRUE, FALSE, $2)
     RETURNING id`,
    [badgeNumber, passwordHash]
  );
  userId = rows[0].id;
}, 30_000);

afterEach(async () => {
  await pool.query(
    `DELETE FROM notification_outbox
     WHERE password_reset_request_id IN (SELECT id FROM password_reset_requests WHERE user_id = $1)`,
    [userId]
  );
  await pool.query('DELETE FROM password_reset_requests WHERE user_id = $1', [userId]);
});

afterAll(async () => {
  await pool.query('DELETE FROM sentinel_users WHERE id = $1', [userId]);
  await pool.end();
});

describe('notification outbox — preuves PostgreSQL (lot 5A)', () => {
  it('recoverStaleNotificationOutboxItems libère un lease périmé sans dépendre du redémarrage du worker (OUT-01)', async () => {
    const id = await insertPasswordResetOutboxItem();

    // Simule une réplique tombée pendant le traitement : la tâche est
    // PROCESSING depuis longtemps, verrouillée bien avant la fenêtre de grâce.
    await pool.query(
      `UPDATE notification_outbox
       SET status = 'PROCESSING', locked_at = NOW() - INTERVAL '10 minutes', attempt_count = 1
       WHERE id = $1`,
      [id]
    );

    await recoverStaleNotificationOutboxItems(5);

    const { rows } = await pool.query<{ status: string; last_error_code: string | null }>(
      `SELECT status, last_error_code FROM notification_outbox WHERE id = $1`,
      [id]
    );
    expect(rows[0].status).toBe('PENDING');
    expect(rows[0].last_error_code).toBe('WORKER_INTERRUPTED');

    // Une fois PENDING, la tâche redevient immédiatement réclamable — la
    // récupération n'a donc pas seulement changé un statut, elle a bien
    // restitué la tâche au cycle normal du worker.
    const claimed = await claimNotificationOutboxItems(10, 5);
    expect(claimed.map((item) => item.id)).toContain(id);
  });

  it('recoverStaleNotificationOutboxItems classe en FAILED un lease périmé ayant épuisé ses tentatives', async () => {
    const id = await insertPasswordResetOutboxItem();
    await pool.query(
      `UPDATE notification_outbox
       SET status = 'PROCESSING', locked_at = NOW() - INTERVAL '10 minutes', attempt_count = 5
       WHERE id = $1`,
      [id]
    );

    await recoverStaleNotificationOutboxItems(5);

    const { rows } = await pool.query<{ status: string }>(
      `SELECT status FROM notification_outbox WHERE id = $1`,
      [id]
    );
    expect(rows[0].status).toBe('FAILED');
  });

  it('ne touche pas un lease PROCESSING encore récent', async () => {
    const id = await insertPasswordResetOutboxItem();
    await pool.query(
      `UPDATE notification_outbox
       SET status = 'PROCESSING', locked_at = NOW(), attempt_count = 1
       WHERE id = $1`,
      [id]
    );

    await recoverStaleNotificationOutboxItems(5);

    const { rows } = await pool.query<{ status: string }>(
      `SELECT status FROM notification_outbox WHERE id = $1`,
      [id]
    );
    expect(rows[0].status).toBe('PROCESSING');
  });

  it.each(['COMPLETED', 'SKIPPED_DISABLED', 'SKIPPED_NO_RECIPIENT'] as const)(
    'persiste le statut terminal %s sans jamais le confondre avec un succès d’envoi implicite (OUT-02)',
    async (status) => {
      const id = await insertPasswordResetOutboxItem();
      const [claimed] = await claimNotificationOutboxItems(10, 5);
      expect(claimed.id).toBe(id);

      await completeNotificationOutboxItem(id, status);

      const { rows } = await pool.query<{ status: string; completed_at: Date | null }>(
        `SELECT status, completed_at FROM notification_outbox WHERE id = $1`,
        [id]
      );
      expect(rows[0].status).toBe(status);
      expect(rows[0].completed_at).not.toBeNull();
    }
  );

  it('rejette un statut terminal hors contrat au niveau de la contrainte SQL (migration 047)', async () => {
    const id = await insertPasswordResetOutboxItem();
    await expect(
      pool.query(`UPDATE notification_outbox SET status = 'SENT_MAYBE' WHERE id = $1`, [id])
    ).rejects.toThrow(/notification_outbox_status_check/);
  });
});

describe('notification outbox — preuves PostgreSQL (lot 5B)', () => {
  it('démarre avec un objet vide et persiste les destinataires livrés par canal lors d’une reprise (OUT-03, migration 048)', async () => {
    const id = await insertPasswordResetOutboxItem();
    const [claimed] = await claimNotificationOutboxItems(10, 5);
    expect(claimed.id).toBe(id);
    expect(claimed.delivered_recipients).toEqual({});

    await retryOrFailNotificationOutboxItem(id, 1, 5, 'SMTP_DELIVERY_FAILED', {
      admin_password_reset: ['ops@example.test'],
    });

    const { rows } = await pool.query<{ delivered_recipients: Record<string, string[]> }>(
      `SELECT delivered_recipients FROM notification_outbox WHERE id = $1`,
      [id]
    );
    expect(rows[0].delivered_recipients).toEqual({
      admin_password_reset: ['ops@example.test'],
    });
  });

  it('relit les destinataires déjà livrés lors de la reprise suivante (OUT-03)', async () => {
    const id = await insertPasswordResetOutboxItem();
    await claimNotificationOutboxItems(10, 5);
    await retryOrFailNotificationOutboxItem(id, 1, 5, 'SMTP_DELIVERY_FAILED', {
      admin_password_reset: ['ops@example.test'],
    });

    // retryOrFailNotificationOutboxItem retarde available_at (backoff) : on
    // vérifie ici l'état persisté tel qu'un prochain cycle le relira, sans
    // dépendre du délai réel avant la prochaine réclamation possible.
    const { rows } = await pool.query<{ delivered_recipients: Record<string, string[]> }>(
      `SELECT delivered_recipients FROM notification_outbox WHERE id = $1`,
      [id]
    );
    expect(rows[0].delivered_recipients).toEqual({
      admin_password_reset: ['ops@example.test'],
    });

    // Une fois la fenêtre de backoff passée, la réclamation lit bien le même état.
    await pool.query(`UPDATE notification_outbox SET available_at = NOW() WHERE id = $1`, [id]);
    const [reclaimed] = await claimNotificationOutboxItems(10, 5);
    expect(reclaimed.id).toBe(id);
    expect(reclaimed.delivered_recipients).toEqual({
      admin_password_reset: ['ops@example.test'],
    });
  });

  it('n’écrase pas les destinataires déjà connus quand une reprise échoue sans en signaler de nouveaux (OUT-04)', async () => {
    const id = await insertPasswordResetOutboxItem();
    await claimNotificationOutboxItems(10, 5);
    await retryOrFailNotificationOutboxItem(id, 1, 5, 'SMTP_DELIVERY_FAILED', {
      admin_password_reset: ['ops@example.test'],
    });

    // Un appelant qui omet le cinquième argument (aucune nouvelle info) ne
    // doit jamais effacer ce qui a déjà été confirmé.
    await retryOrFailNotificationOutboxItem(id, 2, 5, 'SMTP_TIMEOUT');

    const { rows } = await pool.query<{ delivered_recipients: Record<string, string[]> }>(
      `SELECT delivered_recipients FROM notification_outbox WHERE id = $1`,
      [id]
    );
    expect(rows[0].delivered_recipients).toEqual({
      admin_password_reset: ['ops@example.test'],
    });
  });
});
