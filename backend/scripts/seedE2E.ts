/**
 * Seed dédié aux tests end-to-end (Playwright).
 *
 * Crée un jeu de données minimal, déterministe et ré-exécutable :
 *   - un compte admin directement connectable (username + mot de passe connus) ;
 *   - une ligne de production avec une machine à robot simple.
 *
 * Volontairement isolé des données réelles : la ligne E2E est identifiée par un
 * numéro réservé et recréée à neuf à chaque exécution. À lancer avant la suite
 * Playwright (voir le script `test:e2e` du frontend).
 *
 * Usage : `npm run seed:e2e` (depuis backend/).
 */
import 'dotenv/config';
import pool from '../src/db/pool';
import { hashAdminPassword } from '../src/auth/bcrypt';
import { createLineData } from '../src/modules/lines/lines.repository';

// Identifiants partagés avec le test (frontend/e2e/fixtures.ts en garde une copie).
export const E2E_ADMIN_USERNAME = 'e2e-admin';
export const E2E_ADMIN_PASSWORD = 'E2eAdminPass!23'; // ≥ 12 caractères (politique admin)
export const E2E_LINE_NUMBER = '999';
export const E2E_MACHINE_ID = 'E2E-MCH-1';

async function upsertAdmin(): Promise<void> {
  const passwordHash = await hashAdminPassword(E2E_ADMIN_PASSWORD);
  await pool.query(
    `INSERT INTO admin_accounts (username, password_hash)
     VALUES ($1, $2)
     ON CONFLICT (username)
     DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = NOW()`,
    [E2E_ADMIN_USERNAME, passwordHash]
  );
}

async function resetE2ELine(): Promise<void> {
  // Suppression dure (et non soft-delete) pour repartir d'un état propre : la
  // ligne E2E n'est jamais référencée par des incidents réels.
  await pool.query('DELETE FROM production_lines WHERE line_number = $1', [E2E_LINE_NUMBER]);
  await createLineData({
    lineNumber: E2E_LINE_NUMBER,
    isActive: true,
    machines: [
      {
        machineId: E2E_MACHINE_ID,
        brand: 'Panasonic',
        hasDoubleRobot: false,
        robotNumber: '1',
        robotHeads: 16,
      },
    ],
  });
}

async function main(): Promise<void> {
  await upsertAdmin();
  await resetE2ELine();
  // eslint-disable-next-line no-console
  console.log(`Seed E2E OK — admin « ${E2E_ADMIN_USERNAME} », ligne ${E2E_LINE_NUMBER} (${E2E_MACHINE_ID}).`);
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    // eslint-disable-next-line no-console
    console.error('Seed E2E échoué :', err);
    await pool.end();
    process.exit(1);
  });
