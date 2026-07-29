/**
 * Preuve HTTP réelle du contrat "seuls OPERATOR, MAINTENANCE et RESPONSABLE
 * sont attribuables via le flux humain standard de création/modification de
 * compte" (RC5, lot rôles attribuables).
 *
 * Monte une app Express minimale avec les vraies routes /api/auth et
 * /api/accounts (donc le vrai adminAuthMiddleware, la vraie validation Zod
 * RoleEnum, et la vraie contrainte CHECK PostgreSQL en dernier rempart),
 * s'authentifie via un vrai login admin (cookie signé réel), puis envoie de
 * vraies requêtes POST/PATCH avec des rôles refusés.
 */

import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { Pool } from 'pg';
import runMigrations from '../../db/migrate';
import authRoutes from '../../modules/auth/auth.routes';
import accountsRoutes from '../../modules/accounts/accounts.routes';
import {
  acquireIntegrationAdminFixture,
  releaseIntegrationAdminFixture,
  type IntegrationAdminFixture,
} from '../helpers/adminFixture';

process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'accounts_role_authz_integration_jwt_secret_at_least_32_chars';
process.env.COOKIE_SECRET =
  process.env.COOKIE_SECRET || 'accounts_role_authz_integration_cookie_secret_at_least_32';

const DB_URL = process.env.DATABASE_URL!;
const ADMIN_PASSWORD = 'sentinel_integration_fixture_password';

let pool: Pool;
let app: express.Express;
let adminFixture: IntegrationAdminFixture | undefined;
let sessionCookie: string;

const createdUserIds: number[] = [];
const fixtureSuffix = `${process.pid}${Date.now()}`;

function buildApp(): express.Express {
  const testApp = express();
  testApp.use(express.json());
  testApp.use(cookieParser(process.env.COOKIE_SECRET));
  testApp.use('/api/auth', authRoutes);
  testApp.use('/api/accounts', accountsRoutes);
  return testApp;
}

let badgeCounter = 0;
function badgeFor(): string {
  badgeCounter += 1;
  return `9${fixtureSuffix}${badgeCounter}`.replace(/\D/g, '').slice(-11).padStart(11, '9');
}

beforeAll(async () => {
  pool = new Pool({ connectionString: DB_URL });
  await runMigrations();
  app = buildApp();

  adminFixture = await acquireIntegrationAdminFixture(pool);

  const loginResponse = await request(app)
    .post('/api/auth/login')
    .send({
      identifier: adminFixture.admin.username,
      password: adminFixture.createdBySuite ? ADMIN_PASSWORD : undefined,
    });

  // Si un admin préexistait (base partagée), on ne connaît pas son mot de
  // passe : ce test exige une base jetable où la fixture est créée par la
  // suite, exactement comme prescrit par les gardes de ce lot.
  if (!adminFixture.createdBySuite || loginResponse.status !== 200) {
    throw new Error(
      'Ce test exige une base PostgreSQL jetable vierge (aucun admin préexistant) : ' +
        'la fixture admin doit être provisionnée par la suite elle-même.'
    );
  }

  const setCookieHeader = loginResponse.headers['set-cookie'];
  const setCookies = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : setCookieHeader
      ? [setCookieHeader]
      : [];
  const rawCookie = setCookies.find((c) => c.startsWith('sentinel_admin_token='));
  if (!rawCookie) throw new Error('Le login admin n’a émis aucun cookie de session.');
  sessionCookie = rawCookie.split(';')[0];
}, 30_000);

afterAll(async () => {
  try {
    await pool.query(`DELETE FROM account_audit_events WHERE target_user_id = ANY($1::int[])`, [
      createdUserIds,
    ]);
    await pool.query(`DELETE FROM sentinel_users WHERE id = ANY($1::int[])`, [createdUserIds]);
    if (adminFixture) await releaseIntegrationAdminFixture(pool, adminFixture);
  } finally {
    await pool.end();
  }
});

async function countUsersWithBadge(badge: string): Promise<number> {
  const { rows } = await pool.query(
    'SELECT count(*)::int AS n FROM sentinel_users WHERE badge_number = $1',
    [badge]
  );
  return rows[0].n;
}

describe('Rôles attribuables — création de compte (POST /api/accounts)', () => {
  it.each(['OPERATOR', 'MAINTENANCE', 'RESPONSABLE'])(
    'autorise la création avec le rôle humain standard %s',
    async (role) => {
      const badge = badgeFor();
      const response = await request(app)
        .post('/api/accounts')
        .set('Cookie', sessionCookie)
        .send({ firstName: 'Jean', lastName: 'Dupont', badgeNumber: badge, role });

      expect(response.status).toBe(201);
      expect(response.body.role).toBe(role);
      createdUserIds.push(response.body.id);
    }
  );

  it('refuse la création avec le rôle ADMIN et ne crée aucune ligne', async () => {
    const badge = badgeFor();
    const response = await request(app)
      .post('/api/accounts')
      .set('Cookie', sessionCookie)
      .send({ firstName: 'Jean', lastName: 'Dupont', badgeNumber: badge, role: 'ADMIN' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(await countUsersWithBadge(badge)).toBe(0);
  });

  it('refuse la création avec le rôle SYSTEM et ne crée aucune ligne', async () => {
    const badge = badgeFor();
    const response = await request(app)
      .post('/api/accounts')
      .set('Cookie', sessionCookie)
      .send({ firstName: 'Jean', lastName: 'Dupont', badgeNumber: badge, role: 'SYSTEM' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(await countUsersWithBadge(badge)).toBe(0);
  });

  it.each(['admin', 'Admin', 'system', 'System', 'ADMINISTRATOR', 'ROOT', 'SUPERADMIN', ''])(
    'refuse la valeur détournée ou inconnue %j',
    async (role) => {
      const badge = badgeFor();
      const response = await request(app)
        .post('/api/accounts')
        .set('Cookie', sessionCookie)
        .send({ firstName: 'Jean', lastName: 'Dupont', badgeNumber: badge, role });

      expect(response.status).toBe(400);
      expect(await countUsersWithBadge(badge)).toBe(0);
    }
  );

  it('refuse toute création sans authentification admin', async () => {
    const badge = badgeFor();
    const response = await request(app)
      .post('/api/accounts')
      .send({ firstName: 'Jean', lastName: 'Dupont', badgeNumber: badge, role: 'OPERATOR' });

    expect(response.status).toBe(401);
    expect(await countUsersWithBadge(badge)).toBe(0);
  });
});

describe('Rôles attribuables — modification de compte (PATCH /api/accounts/:id)', () => {
  let existingUserId: number;
  const existingBadge = badgeFor();

  beforeAll(async () => {
    const response = await request(app).post('/api/accounts').set('Cookie', sessionCookie).send({
      firstName: 'Marie',
      lastName: 'Curie',
      badgeNumber: existingBadge,
      role: 'OPERATOR',
    });
    expect(response.status).toBe(201);
    existingUserId = response.body.id;
    createdUserIds.push(existingUserId);
  });

  it('refuse la promotion vers ADMIN et laisse le rôle inchangé', async () => {
    const response = await request(app)
      .patch(`/api/accounts/${existingUserId}`)
      .set('Cookie', sessionCookie)
      .send({ role: 'ADMIN' });

    expect(response.status).toBe(400);

    const { rows } = await pool.query('SELECT role FROM sentinel_users WHERE id = $1', [
      existingUserId,
    ]);
    expect(rows[0].role).toBe('OPERATOR');
  });

  it('refuse la promotion vers SYSTEM et laisse le rôle inchangé', async () => {
    const response = await request(app)
      .patch(`/api/accounts/${existingUserId}`)
      .set('Cookie', sessionCookie)
      .send({ role: 'SYSTEM' });

    expect(response.status).toBe(400);

    const { rows } = await pool.query('SELECT role FROM sentinel_users WHERE id = $1', [
      existingUserId,
    ]);
    expect(rows[0].role).toBe('OPERATOR');
  });

  it('autorise un changement de rôle entre les trois rôles humains standards', async () => {
    const response = await request(app)
      .patch(`/api/accounts/${existingUserId}`)
      .set('Cookie', sessionCookie)
      .send({ role: 'RESPONSABLE' });

    expect(response.status).toBe(200);
    expect(response.body.role).toBe('RESPONSABLE');
  });
});

describe('Comptes Administrateur/Système existants — non-régression', () => {
  it('la contrainte CHECK empêche tout rôle hors liste, même en écriture SQL directe', async () => {
    await expect(
      pool.query(
        `INSERT INTO sentinel_users (first_name, last_name, badge_number, role, is_active, is_deleted)
         VALUES ('Xx', 'Yy', $1, 'ADMIN', TRUE, FALSE)`,
        [badgeFor()]
      )
    ).rejects.toThrow(/chk_sentinel_users_role/);
  });

  it('le compte admin fixture reste inchangé après les tentatives de contournement', async () => {
    const { rows } = await pool.query('SELECT id, username FROM admin_accounts WHERE id = $1', [
      adminFixture!.admin.id,
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].username).toBe(adminFixture!.admin.username);
  });
});
