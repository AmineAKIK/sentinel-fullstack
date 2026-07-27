/**
 * Seed dédié aux tests end-to-end (Playwright).
 *
 * Crée un jeu de données minimal, déterministe et ré-exécutable :
 *   - un compte admin directement connectable (username + mot de passe connus) ;
 *   - une ligne Admin modifiable et une ligne Atelier avec incidents actifs.
 *
 * Volontairement isolé des données réelles : les lignes E2E sont identifiées par
 * des numéros réservés et recréées à neuf à chaque exécution. À lancer avant
 * la suite Playwright (voir le script `test:e2e` du frontend).
 *
 * Usage : `npm run guard:e2e && npm run seed:e2e` (depuis backend/).
 */
import 'dotenv/config';
import pool from '../src/db/pool';
import { hashAdminPassword, hashWorkshopPassword } from '../src/auth/bcrypt';
import { hashBoardCode } from '../src/modules/board/board.auth';
import { createLineData } from '../src/modules/lines/lines.repository';
import {
  createIncidentService,
  requestEditIncidentService,
} from '../src/modules/workshop/workshop.service.edit';
import { requestCancelIncidentService } from '../src/modules/workshop/workshop.service.mutations';
import { assertSafeTestDatabaseUrl } from '../src/testing/databaseGuard';

// Identifiants partagés avec le test (frontend/e2e/fixtures.ts en garde une copie).
export const E2E_ADMIN_USERNAME = 'e2e-admin';
export const E2E_ADMIN_PASSWORD = 'E2eAdminPass!23'; // ≥ 12 caractères (politique admin)
export const E2E_ADMIN_LINE_NUMBER = '998';
export const E2E_ADMIN_MACHINE_ID = 'E2E-MCH-ADMIN-1';
export const E2E_LINE_NUMBER = '999';
export const E2E_MACHINE_ID = 'E2E-MCH-1';
export const E2E_RESPONSABLE_BADGE = '990001';
export const E2E_OPERATOR_BADGE = '990002';
export const E2E_MAINTENANCE_BADGE = '990003';
export const E2E_WORKSHOP_PASSWORD = 'E2eWorkshop!23';
export const E2E_BOARD_CODE = 'e2e-board-code-42';

async function upsertAdmin(): Promise<void> {
  const passwordHash = await hashAdminPassword(E2E_ADMIN_PASSWORD);
  const boardCodeHash = await hashBoardCode(E2E_BOARD_CODE);
  await pool.query(
    `INSERT INTO admin_accounts (username, password_hash, board_enabled, board_code_hash)
     VALUES ($1, $2, TRUE, $3)
     ON CONFLICT (username)
     DO UPDATE SET password_hash = EXCLUDED.password_hash,
                   board_enabled = TRUE,
                   board_code_hash = EXCLUDED.board_code_hash,
                   updated_at = NOW()`,
    [E2E_ADMIN_USERNAME, passwordHash, boardCodeHash]
  );
}

async function resetE2ELine(lineNumber: string): Promise<void> {
  await pool.query(
    `DELETE FROM workshop_arbitration_cases
     WHERE incident_id IN (
       SELECT id FROM workshop_incidents WHERE line_number = $1
     )`,
    [lineNumber]
  );
  await pool.query(
    `DELETE FROM workshop_incident_followers
     WHERE incident_id IN (
       SELECT id FROM workshop_incidents WHERE line_number = $1
     )`,
    [lineNumber]
  );
  await pool.query('DELETE FROM workshop_incidents WHERE line_number = $1', [lineNumber]);
  await pool.query(
    `DELETE FROM line_audit_events
     WHERE target_line_id IN (
       SELECT id FROM production_lines WHERE line_number = $1
     )`,
    [lineNumber]
  );
  await pool.query('DELETE FROM production_lines WHERE line_number = $1', [lineNumber]);
}

async function createE2ELine(lineNumber: string, machineId: string): Promise<number> {
  const line = await createLineData({
    lineNumber,
    isActive: true,
    machines: [
      {
        machineId,
        brand: 'Panasonic',
        hasDoubleRobot: false,
        robotNumber: '1',
        robotHeads: 16,
      },
    ],
  });
  return line.id;
}

async function upsertWorkshopUser(input: {
  firstName: string;
  lastName: string;
  badgeNumber: string;
  role: 'OPERATOR' | 'MAINTENANCE' | 'RESPONSABLE';
}): Promise<number> {
  const passwordHash = await hashWorkshopPassword(E2E_WORKSHOP_PASSWORD);
  const { rows: existingRows } = await pool.query<{ id: number }>(
    `SELECT id
     FROM sentinel_users
     WHERE lower(btrim(badge_number)) = lower(btrim($1))
       AND is_deleted = FALSE
     LIMIT 1`,
    [input.badgeNumber]
  );

  if (existingRows[0]) {
    const { rows } = await pool.query<{ id: number }>(
      `UPDATE sentinel_users
       SET first_name = $2,
           last_name = $3,
           role = $4,
           is_active = TRUE,
           password_hash = $5,
           password_setup_token_hash = NULL,
           password_setup_expires_at = NULL,
           session_version = session_version + 1,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id`,
      [existingRows[0].id, input.firstName, input.lastName, input.role, passwordHash]
    );
    return rows[0].id;
  }

  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO sentinel_users (
       first_name, last_name, badge_number, role, password_hash
     )
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [input.firstName, input.lastName, input.badgeNumber, input.role, passwordHash]
  );
  return rows[0].id;
}

function createdIncidentId(data: unknown, context: string): number {
  const id = (data as { id?: unknown } | null)?.id;
  if (typeof id !== 'number') throw new Error(`${context}: identifiant incident manquant.`);
  return id;
}

async function createArbitrationIncidents(lineId: number, operatorId: number): Promise<void> {
  const cancelIncident = await createIncidentService(
    {
      lineId,
      machineId: E2E_MACHINE_ID,
      robotLabel: '1',
      headNumber: 1,
      state: 'INDISPONIBLE',
      comment: 'Incident E2E destiné à l’arbitrage d’annulation.',
      currentProduct: 'E2E-ANNULATION',
    },
    operatorId,
    'OPERATOR'
  );
  if (!cancelIncident.ok) throw new Error(`Création annulation E2E: ${cancelIncident.message}`);
  const cancelIncidentId = createdIncidentId(cancelIncident.data, 'Création annulation E2E');
  const cancelRequest = await requestCancelIncidentService(
    cancelIncidentId,
    'Doublon E2E à vérifier avant annulation.',
    operatorId,
    'OPERATOR'
  );
  if (!cancelRequest.ok) throw new Error(`Demande annulation E2E: ${cancelRequest.message}`);

  const editIncident = await createIncidentService(
    {
      lineId,
      machineId: E2E_MACHINE_ID,
      robotLabel: '1',
      headNumber: 2,
      state: 'DEGRADEE',
      comment: 'Commentaire initial E2E.',
      currentProduct: 'E2E-CORRECTION',
    },
    operatorId,
    'OPERATOR'
  );
  if (!editIncident.ok) throw new Error(`Création correction E2E: ${editIncident.message}`);
  const editIncidentId = createdIncidentId(editIncident.data, 'Création correction E2E');
  const editRequest = await requestEditIncidentService(
    editIncidentId,
    { comment: 'Commentaire corrigé et validable depuis le modal E2E.' },
    operatorId,
    'OPERATOR'
  );
  if (!editRequest.ok) throw new Error(`Demande correction E2E: ${editRequest.message}`);

  // Incident dédié à la recette de RETRAIT d'annulation (RC3 lot 5, lot 10) :
  // l'opérateur a une demande d'annulation active qu'il pourra retirer depuis
  // l'UI. Sur une tête distincte pour coexister avec les incidents ci-dessus.
  const withdrawIncident = await createIncidentService(
    {
      lineId,
      machineId: E2E_MACHINE_ID,
      robotLabel: '1',
      headNumber: 3,
      state: 'INDISPONIBLE',
      comment: 'Incident E2E destiné au retrait de demande d’annulation.',
      currentProduct: 'E2E-RETRAIT',
    },
    operatorId,
    'OPERATOR'
  );
  if (!withdrawIncident.ok) throw new Error(`Création retrait E2E: ${withdrawIncident.message}`);
  const withdrawIncidentId = createdIncidentId(withdrawIncident.data, 'Création retrait E2E');
  const withdrawRequest = await requestCancelIncidentService(
    withdrawIncidentId,
    'Doublon E2E à retirer par le demandeur.',
    operatorId,
    'OPERATOR'
  );
  if (!withdrawRequest.ok) throw new Error(`Demande retrait E2E: ${withdrawRequest.message}`);
}

async function main(): Promise<void> {
  assertSafeTestDatabaseUrl(process.env.DATABASE_URL, 'e2e');
  await upsertAdmin();
  await resetE2ELine(E2E_ADMIN_LINE_NUMBER);
  await resetE2ELine(E2E_LINE_NUMBER);
  await createE2ELine(E2E_ADMIN_LINE_NUMBER, E2E_ADMIN_MACHINE_ID);
  const lineId = await createE2ELine(E2E_LINE_NUMBER, E2E_MACHINE_ID);
  const operatorId = await upsertWorkshopUser({
    firstName: 'Opérateur',
    lastName: 'E2E',
    badgeNumber: E2E_OPERATOR_BADGE,
    role: 'OPERATOR',
  });
  await upsertWorkshopUser({
    firstName: 'Responsable',
    lastName: 'E2E',
    badgeNumber: E2E_RESPONSABLE_BADGE,
    role: 'RESPONSABLE',
  });
  await upsertWorkshopUser({
    firstName: 'Maintenance',
    lastName: 'E2E',
    badgeNumber: E2E_MAINTENANCE_BADGE,
    role: 'MAINTENANCE',
  });
  await createArbitrationIncidents(lineId, operatorId);
  console.log(
    `Seed E2E OK — admin « ${E2E_ADMIN_USERNAME} », atelier « ${E2E_RESPONSABLE_BADGE} », ` +
      `ligne admin ${E2E_ADMIN_LINE_NUMBER} (${E2E_ADMIN_MACHINE_ID}), ` +
      `ligne atelier ${E2E_LINE_NUMBER} (${E2E_MACHINE_ID}).`
  );
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('Seed E2E échoué :', err);
    await pool.end();
    process.exit(1);
  });
