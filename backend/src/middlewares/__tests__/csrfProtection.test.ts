import { readFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import request from 'supertest';
import { createCsrfProtection } from '../csrfProtection';

const CLIENT_ORIGIN = 'https://sentinel.akiksystems.fr';
const SIBLING_ORIGIN = 'https://untrusted.sentinel.akiksystems.fr';

type UnsafeMethod = 'post' | 'put' | 'patch' | 'delete';

function createTestApp(): Express {
  const app = express();
  app.use('/api', createCsrfProtection(CLIENT_ORIGIN));
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.all('/api/*', (_req, res) => {
    res.setHeader('X-CSRF-Probe-Reached', 'true');
    res.status(204).end();
  });
  return app;
}

function unsafeRequest(app: Express, method: UnsafeMethod, route: string) {
  switch (method) {
    case 'post':
      return request(app).post(route);
    case 'put':
      return request(app).put(route);
    case 'patch':
      return request(app).patch(route);
    case 'delete':
      return request(app).delete(route);
  }
}

function expectCsrfRefusal(response: request.Response): void {
  expect(response.status).toBe(403);
  expect(response.headers['x-csrf-probe-reached']).toBeUndefined();
  expect(response.body).toEqual({
    error: {
      code: 'FORBIDDEN',
      message: 'Requête refusée.',
    },
  });
}

async function sendRawMutationWithHeaders(headerLines: string[]): Promise<string> {
  const server = createTestApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;

  try {
    return await new Promise<string>((resolve, reject) => {
      const chunks: string[] = [];
      const socket = createConnection({ host: '127.0.0.1', port }, () => {
        socket.end(
          [
            'POST /api/auth/login HTTP/1.1',
            `Host: 127.0.0.1:${port}`,
            ...headerLines,
            'Content-Length: 0',
            'Connection: close',
            '',
            '',
          ].join('\r\n')
        );
      });
      socket.setEncoding('utf8');
      socket.on('data', (chunk: string) => chunks.push(chunk));
      socket.on('end', () => resolve(chunks.join('')));
      socket.on('error', reject);
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

describe('protection CSRF centrale — Origin et Referer exacts', () => {
  const app = createTestApp();

  it.each([
    { label: 'origine sœur', origin: SIBLING_ORIGIN },
    { label: 'cross-site', origin: 'https://attacker.example' },
    { label: 'valeur null', origin: 'null' },
    { label: 'suffixe trompeur', origin: `${CLIENT_ORIGIN}.attacker.example` },
    { label: 'préfixe trompeur', origin: `https://attacker.example/${CLIENT_ORIGIN}` },
    { label: 'URL mal formée', origin: 'https://[invalid' },
    { label: 'origine avec chemin', origin: `${CLIENT_ORIGIN}/form` },
    { label: 'mauvais port', origin: `${CLIENT_ORIGIN}:8443` },
    { label: 'origine avec identifiant incorporé', origin: 'https://user@sentinel.akiksystems.fr' },
  ])('refuse $label', async ({ origin }) => {
    const response = await request(app)
      .post('/api/auth/login')
      .set('Origin', origin)
      .set('Sec-Fetch-Site', 'same-site')
      .send({ username: 'secret-user', password: 'secret-password' });

    expectCsrfRefusal(response);
    expect(JSON.stringify(response.body)).not.toContain(origin);
    expect(JSON.stringify(response.body)).not.toContain('secret');
  });

  it('refuse plusieurs valeurs Origin même si la première est exacte', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .set('Origin', `${CLIENT_ORIGIN}, ${SIBLING_ORIGIN}`)
      .send({ username: 'secret-user', password: 'secret-password' });

    expectCsrfRefusal(response);
  });

  it.each([
    {
      label: 'Origin',
      lines: [`Origin: ${CLIENT_ORIGIN}`, `Origin: ${SIBLING_ORIGIN}`],
    },
    {
      label: 'Referer',
      lines: [`Referer: ${CLIENT_ORIGIN}/login`, `Referer: ${SIBLING_ORIGIN}/form`],
    },
    {
      label: 'Sec-Fetch-Site',
      lines: [
        `Origin: ${CLIENT_ORIGIN}`,
        'Sec-Fetch-Site: same-origin',
        'Sec-Fetch-Site: cross-site',
      ],
    },
  ])('refuse de vraies lignes HTTP $label dupliquées', async ({ lines }) => {
    const rawResponse = await sendRawMutationWithHeaders(lines);

    expect(rawResponse).toMatch(/^HTTP\/1\.1 403 Forbidden\r\n/);
    expect(rawResponse).not.toContain('X-CSRF-Probe-Reached');
    expect(rawResponse).toContain('"code":"FORBIDDEN"');
    expect(rawResponse).not.toContain(SIBLING_ORIGIN);
  });

  it('donne la priorité à Origin et ne se replie jamais sur un Referer valide', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .set('Origin', SIBLING_ORIGIN)
      .set('Referer', `${CLIENT_ORIGIN}/login`);

    expectCsrfRefusal(response);
  });

  it('accepte uniquement la valeur Origin exactement configurée', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .set('Origin', CLIENT_ORIGIN)
      .set('Sec-Fetch-Site', 'same-origin')
      .send({ username: 'admin', password: 'valid' });

    expect(response.status).toBe(204);
    expect(response.headers['x-csrf-probe-reached']).toBe('true');
  });

  it('accepte un Referer de la même origine exacte quand Origin est absent', async () => {
    const response = await request(app)
      .patch('/api/admin/settings/app')
      .set('Referer', `${CLIENT_ORIGIN}/admin/settings?tab=application`)
      .set('Sec-Fetch-Site', 'same-origin')
      .send({ boardLabel: 'Atelier' });

    expect(response.status).toBe(204);
    expect(response.headers['x-csrf-probe-reached']).toBe('true');
  });

  it.each([
    `${SIBLING_ORIGIN}/form`,
    'https://attacker.example/form',
    `${CLIENT_ORIGIN}.attacker.example/form`,
    'https://[invalid',
    `${CLIENT_ORIGIN},${SIBLING_ORIGIN}`,
  ])(
    'refuse un Referer absent d’Origin qui ne prouve pas l’origine exacte : %s',
    async (referer) => {
      const response = await request(app)
        .delete('/api/workshop/incidents/42/follow')
        .set('Referer', referer);

      expectCsrfRefusal(response);
    }
  );

  it('refuse deux en-têtes de provenance absents sans exception locale anticipée', async () => {
    const response = await request(app).post('/api/board/logout');

    expectCsrfRefusal(response);
  });

  it('refuse une origine sœur sans altérer la session, puis accepte la même origine', async () => {
    const sessionApp = express();
    sessionApp.use(cookieParser());
    sessionApp.get('/api/session/start', (_req, res) => {
      res.cookie('sentinel_session', 'stable', {
        httpOnly: true,
        sameSite: 'strict',
      });
      res.status(204).end();
    });
    sessionApp.use('/api', createCsrfProtection(CLIENT_ORIGIN));
    sessionApp.post('/api/session/probe', (req, res) => {
      res.json({ session: req.cookies.sentinel_session ?? null });
    });
    const agent = request.agent(sessionApp);

    await agent.get('/api/session/start').expect(204);
    const refused = await agent
      .post('/api/session/probe')
      .set('Origin', SIBLING_ORIGIN)
      .set('Sec-Fetch-Site', 'same-site');
    expectCsrfRefusal(refused);
    expect(refused.headers['set-cookie']).toBeUndefined();

    const accepted = await agent
      .post('/api/session/probe')
      .set('Origin', CLIENT_ORIGIN)
      .set('Sec-Fetch-Site', 'same-origin');
    expect(accepted.status).toBe(200);
    expect(accepted.body).toEqual({ session: 'stable' });
  });
});

describe('protection CSRF centrale — Fetch Metadata en défense supplémentaire', () => {
  const app = createTestApp();

  it.each(['same-origin', 'same-site', 'none', undefined])(
    'accepte Sec-Fetch-Site=%s uniquement avec une provenance exacte',
    async (fetchSite) => {
      let pending = request(app).post('/api/board/session').set('Origin', CLIENT_ORIGIN);
      if (fetchSite) pending = pending.set('Sec-Fetch-Site', fetchSite);
      const response = await pending.send({ code: 'board-code' });

      expect(response.status).toBe(204);
      expect(response.headers['x-csrf-probe-reached']).toBe('true');
    }
  );

  it('traite same-site comme non fiable et refuse une origine sœur', async () => {
    const response = await request(app)
      .post('/api/board/session')
      .set('Origin', SIBLING_ORIGIN)
      .set('Sec-Fetch-Site', 'same-site')
      .send({ code: 'board-code' });

    expectCsrfRefusal(response);
  });

  it.each(['cross-site', 'unexpected', 'same-origin, cross-site'])(
    'refuse Sec-Fetch-Site incohérent ou invalide : %s',
    async (fetchSite) => {
      const response = await request(app)
        .post('/api/board/session')
        .set('Origin', CLIENT_ORIGIN)
        .set('Sec-Fetch-Site', fetchSite)
        .send({ code: 'board-code' });

      expectCsrfRefusal(response);
    }
  );
});

describe('protection CSRF centrale — méthodes, audiences et formes de requête', () => {
  const app = createTestApp();

  const mutationInventory: Array<{
    audience: string;
    method: UnsafeMethod;
    route: string;
  }> = [
    { audience: 'Session Admin/Atelier', method: 'post', route: '/api/auth/login' },
    { audience: 'Session Admin/Atelier', method: 'post', route: '/api/auth/logout' },
    {
      audience: 'Session Admin/Atelier',
      method: 'post',
      route: '/api/auth/password-reset/request',
    },
    { audience: 'Admin', method: 'post', route: '/api/admin/security/verify-password' },
    { audience: 'Admin', method: 'patch', route: '/api/admin/security/password' },
    { audience: 'Admin', method: 'patch', route: '/api/admin/security/email' },
    { audience: 'Admin', method: 'patch', route: '/api/admin/settings/notifications' },
    { audience: 'Admin', method: 'patch', route: '/api/admin/settings/board/toggle' },
    { audience: 'Admin', method: 'patch', route: '/api/admin/settings/board/code' },
    { audience: 'Admin', method: 'patch', route: '/api/admin/settings/app' },
    { audience: 'Admin', method: 'post', route: '/api/admin/accounts' },
    { audience: 'Admin', method: 'patch', route: '/api/admin/accounts/42' },
    { audience: 'Admin', method: 'patch', route: '/api/admin/accounts/42/activate' },
    { audience: 'Admin', method: 'patch', route: '/api/admin/accounts/42/deactivate' },
    { audience: 'Admin', method: 'patch', route: '/api/admin/accounts/42/reset-password' },
    { audience: 'Admin', method: 'delete', route: '/api/admin/accounts/42' },
    { audience: 'Admin', method: 'post', route: '/api/admin/lines/check-line-conflicts' },
    { audience: 'Admin', method: 'post', route: '/api/admin/lines' },
    { audience: 'Admin', method: 'patch', route: '/api/admin/lines/42' },
    { audience: 'Admin archive', method: 'post', route: '/api/admin/lines/42/archive' },
    { audience: 'Admin', method: 'post', route: '/api/admin/support/chat' },
    {
      audience: 'Admin',
      method: 'patch',
      route: '/api/admin/password-reset-requests/42/handle',
    },
    { audience: 'Board session', method: 'post', route: '/api/board/session' },
    { audience: 'Board session', method: 'post', route: '/api/board/logout' },
    { audience: 'Atelier', method: 'post', route: '/api/workshop/support/chat' },
    { audience: 'Atelier', method: 'post', route: '/api/workshop/incidents' },
    { audience: 'Atelier cancel', method: 'post', route: '/api/workshop/incidents/42/cancel' },
    { audience: 'Atelier follow', method: 'post', route: '/api/workshop/incidents/42/follow' },
    {
      audience: 'Atelier arbitrage',
      method: 'post',
      route: '/api/workshop/incidents/42/arbitration-consultation',
    },
    { audience: 'Atelier', method: 'patch', route: '/api/workshop/incidents/42' },
    {
      audience: 'Atelier unfollow',
      method: 'delete',
      route: '/api/workshop/incidents/42/follow',
    },
    {
      audience: 'Atelier cancel historique',
      method: 'delete',
      route: '/api/workshop/incidents/42',
    },
    { audience: 'Méthode PUT future', method: 'put', route: '/api/_put-probe' },
  ];

  it.each(mutationInventory)(
    'accepte l’origine exacte et refuse l’origine sœur pour $method $route ($audience)',
    async ({ method, route }) => {
      const exactOriginResponse = await unsafeRequest(app, method, route)
        .set('Origin', CLIENT_ORIGIN)
        .set('Sec-Fetch-Site', 'same-site')
        .send({ probe: true });

      expect(exactOriginResponse.status).toBe(204);
      expect(exactOriginResponse.headers['x-csrf-probe-reached']).toBe('true');

      const siblingOriginResponse = await unsafeRequest(app, method, route)
        .set('Origin', SIBLING_ORIGIN)
        .set('Sec-Fetch-Site', 'same-site')
        .send({ probe: true });

      expectCsrfRefusal(siblingOriginResponse);
    }
  );

  it('bloque un formulaire HTML simple avant la mutation', async () => {
    const response = await request(app)
      .post('/api/admin/lines/42/archive')
      .set('Origin', SIBLING_ORIGIN)
      .set('Sec-Fetch-Site', 'same-site')
      .type('form')
      .send({ force: 'false' });

    expectCsrfRefusal(response);
  });

  it('laisse passer le POST JSON légitime qui sera preflighté par le navigateur', async () => {
    const response = await request(app)
      .post('/api/workshop/incidents/42/arbitration-consultation')
      .set('Origin', CLIENT_ORIGIN)
      .set('Sec-Fetch-Site', 'same-site')
      .type('json')
      .send({ requestType: 'EDIT' });

    expect(response.status).toBe(204);
    expect(response.headers['x-csrf-probe-reached']).toBe('true');
  });
});

describe('protection CSRF centrale — méthodes sûres et couverture du serveur', () => {
  const app = createTestApp();

  it.each(['get', 'head', 'options'] as const)(
    'préserve %s même avec des en-têtes hostiles',
    async (method) => {
      const pending =
        method === 'get'
          ? request(app).get('/api/health')
          : method === 'head'
            ? request(app).head('/api/config')
            : request(app).options('/api/workshop/incidents');
      const response = await pending
        .set('Origin', SIBLING_ORIGIN)
        .set('Sec-Fetch-Site', 'cross-site');

      expect(response.status).toBe(204);
      expect(response.headers['x-csrf-probe-reached']).toBe('true');
    }
  );

  it('préserve le vrai preflight CORS d’un POST JSON', async () => {
    const corsApp = express();
    corsApp.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
    corsApp.use('/api', createCsrfProtection(CLIENT_ORIGIN));

    const response = await request(corsApp)
      .options('/api/board/session')
      .set('Origin', CLIENT_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(CLIENT_ORIGIN);
    expect(response.headers['access-control-allow-methods']).toContain('POST');
    expect(response.headers['access-control-allow-headers']).toContain('content-type');
  });

  it('monte une seule garde /api avant chaque routeur mutatif', () => {
    const serverSource = readFileSync(path.join(__dirname, '../../server.ts'), 'utf8');
    const guard = "app.use('/api', createCsrfProtection(CLIENT_ORIGIN));";
    const guardIndex = serverSource.indexOf(guard);

    expect(serverSource.match(/createCsrfProtection\(CLIENT_ORIGIN\)/g)).toHaveLength(1);
    expect(guardIndex).toBeGreaterThan(-1);
    for (const mount of [
      "app.use('/api/auth', authRoutes)",
      "app.use('/api/auth/password-reset', passwordResetRoutes)",
      "app.use('/api/admin/security', adminSecurityRoutes)",
      "app.use('/api/admin/settings', adminSettingsRoutes)",
      "app.use('/api/admin/accounts', accountsRoutes)",
      "app.use('/api/admin/lines', linesRoutes)",
      "app.use('/api/admin/support', adminSupportRoutes)",
      "app.use('/api/admin', adminRoutes)",
      "app.use('/api/board', boardRouter)",
      "app.use('/api/workshop/support', workshopSupportRoutes)",
      "app.use('/api/workshop', workshopRoutes)",
    ]) {
      expect(serverSource.indexOf(mount)).toBeGreaterThan(guardIndex);
    }
  });
});
