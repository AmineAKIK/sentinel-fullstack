/**
 * Preuve HTTP réelle du contrat "workshopAuthMiddleware revalide
 * l'utilisateur actif et son rôle courant depuis la base à chaque requête"
 * (lot 10, TEST-02) — remplace un check textuel de verifyReliability.js qui
 * ne faisait que grep les littéraux SQL du middleware.
 *
 * Monte une app Express minimale avec la vraie route de login unifiée et le
 * vrai workshopAuthMiddleware sur une route protégée factice, pas server.ts
 * entier : suffisant pour exercer le contrat HTTP réel (cookie signé, JWT,
 * requalification en base) sans dépendre du reste de la stack applicative.
 */

import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { Pool } from 'pg';
import runMigrations from '../../db/migrate';
import { hashWorkshopPassword } from '../../auth/bcrypt';
import authRoutes from '../../modules/auth/auth.routes';
import { workshopAuthMiddleware } from '../../middlewares/workshopAuth';

// Le job CI d'intégration ne définit ni JWT_SECRET ni COOKIE_SECRET (contrairement
// au job e2e) : sans eux, signAuthToken renvoie null et le login n'émet aucun
// cookie. On les fixe ici pour que le test soit autonome, indépendant de la
// config d'environnement de la machine ou du runner. getJwtSecret relit
// process.env à chaque appel, donc une définition avant buildApp() suffit.
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'workshop_auth_integration_jwt_secret_at_least_32_chars';
process.env.COOKIE_SECRET =
  process.env.COOKIE_SECRET || 'workshop_auth_integration_cookie_secret_at_least_32_chars';

const DB_URL = process.env.DATABASE_URL!;
const fixtureSuffix = `${process.pid}${Date.now()}`;
const badgeNumber = `96${fixtureSuffix}`.slice(0, 9);
const password = 'workshop_auth_integration_password';

let pool: Pool;
let userId: number;
let app: express.Express;

function buildApp(): express.Express {
  const testApp = express();
  testApp.use(express.json());
  testApp.use(cookieParser(process.env.COOKIE_SECRET));
  testApp.use('/api/auth', authRoutes);
  testApp.get('/api/workshop/_probe', workshopAuthMiddleware, (req, res) => {
    res.json({ userId: req.workshopUser?.userId, role: req.workshopUser?.role });
  });
  return testApp;
}

beforeAll(async () => {
  pool = new Pool({ connectionString: DB_URL });
  await runMigrations();
  app = buildApp();

  const passwordHash = await hashWorkshopPassword(password);
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO sentinel_users
       (first_name, last_name, badge_number, role, is_active, is_deleted, password_hash)
     VALUES ('Auth', 'Probe', $1, 'OPERATOR', TRUE, FALSE, $2)
     RETURNING id`,
    [badgeNumber, passwordHash]
  );
  userId = rows[0].id;
}, 30_000);

afterAll(async () => {
  await pool.query('DELETE FROM sentinel_users WHERE id = $1', [userId]);
  await pool.end();
});

async function loginAndGetCookie(): Promise<string> {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ identifier: badgeNumber, password });
  expect(response.status).toBe(200);
  const setCookie = response.headers['set-cookie'];
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  const workshopCookie = cookies.find((c: string) => c.startsWith('sentinel_workshop_token='));
  expect(workshopCookie).toBeDefined();
  return workshopCookie!.split(';')[0];
}

describe('workshopAuthMiddleware — revalidation réelle en base (lot 10, TEST-02)', () => {
  it('refuse toute requête sans cookie', async () => {
    const response = await request(app).get('/api/workshop/_probe');
    expect(response.status).toBe(401);
  });

  it('accepte une session valide et expose le rôle courant', async () => {
    const cookie = await loginAndGetCookie();

    const response = await request(app).get('/api/workshop/_probe').set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ userId, role: 'OPERATOR' });
  });

  it('refuse un cookie valide dès que le compte est désactivé en base, sans attendre une nouvelle connexion', async () => {
    const cookie = await loginAndGetCookie();
    await request(app).get('/api/workshop/_probe').set('Cookie', cookie).expect(200);

    await pool.query('UPDATE sentinel_users SET is_active = FALSE WHERE id = $1', [userId]);

    const response = await request(app).get('/api/workshop/_probe').set('Cookie', cookie);
    expect(response.status).toBe(401);

    await pool.query('UPDATE sentinel_users SET is_active = TRUE WHERE id = $1', [userId]);
  });

  it('refuse un cookie valide dès que le rôle change en base (revalidation du rôle courant, pas du rôle au moment du login)', async () => {
    const cookie = await loginAndGetCookie();
    await request(app).get('/api/workshop/_probe').set('Cookie', cookie).expect(200);

    // session_version incrémentée par le changement de rôle : le token émis
    // avant ne correspond plus à la session active.
    await pool.query(
      `UPDATE sentinel_users SET role = 'MAINTENANCE', session_version = session_version + 1 WHERE id = $1`,
      [userId]
    );

    const response = await request(app).get('/api/workshop/_probe').set('Cookie', cookie);
    expect(response.status).toBe(401);

    const freshCookie = await loginAndGetCookie();
    const freshResponse = await request(app).get('/api/workshop/_probe').set('Cookie', freshCookie);
    expect(freshResponse.status).toBe(200);
    expect(freshResponse.body.role).toBe('MAINTENANCE');

    await pool.query(
      `UPDATE sentinel_users SET role = 'OPERATOR', session_version = session_version + 1 WHERE id = $1`,
      [userId]
    );
  });
});
