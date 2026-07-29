/**
 * Preuve comportementale (pas un grep du source) que la journalisation HTTP ne
 * fait fuiter aucun secret. Monte le vrai middleware pino-http avec la config de
 * production, émet une réponse portant un Set-Cookie signé, et inspecte la
 * sortie JSON réelle du logger (P0 rc.2).
 */
import http from 'http';
import { AddressInfo } from 'net';
import { pino } from 'pino';
import pinoHttp from 'pino-http';
import { httpLoggingOptions } from '../httpLogging';

// Valeurs factices — jamais de vrai secret dans une fixture.
const FAKE_JWT = 'HEADER.PAYLOAD.SIGNATURE-fake-jwt-value';
const FAKE_SIGNED_COOKIE = `sentinel_board_token=s%3A${FAKE_JWT}.fakeSig; Path=/; HttpOnly`;
const FAKE_REQUEST_COOKIE = 'sentinel_workshop_token=inbound-fake-value';
const FAKE_AUTHORIZATION = 'Bearer inbound-fake-bearer';
const FAKE_ORIGIN = 'https://inbound-fake-origin-token.example.test';
const FAKE_REFERER = 'https://sentinel.example.test/form?token=inbound-fake-referer-token';

async function captureRequestLog(): Promise<string> {
  const chunks: string[] = [];
  const stream = { write: (s: string) => void chunks.push(s) };
  const logger = pino({ level: 'info' }, stream);
  const middleware = pinoHttp(httpLoggingOptions(logger));

  const server = http.createServer((req, res) => {
    middleware(req, res);
    res.setHeader('Set-Cookie', FAKE_SIGNED_COOKIE);
    res.statusCode = 200;
    res.end('ok');
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;

  await new Promise<void>((resolve, reject) => {
    const request = http.get(
      {
        port,
        path: '/api/board/session',
        headers: {
          cookie: FAKE_REQUEST_COOKIE,
          authorization: FAKE_AUTHORIZATION,
          origin: FAKE_ORIGIN,
          referer: FAKE_REFERER,
        },
      },
      (res) => {
        res.on('data', () => undefined);
        res.on('end', () => setTimeout(resolve, 50));
      }
    );
    request.on('error', reject);
  });

  await new Promise<void>((resolve) => server.close(() => resolve()));
  return chunks.join('');
}

describe('journalisation HTTP — aucun secret ne fuit (P0 rc.2)', () => {
  it('masque le Set-Cookie sortant, y compris le jeton signé et le JWT', async () => {
    const output = await captureRequestLog();

    // La ligne de log a bien été produite pour cette requête.
    expect(output).toContain('request completed');

    // Aucune trace du cookie signé, du JWT ni du nom de valeur du jeton.
    expect(output).not.toContain(FAKE_JWT);
    expect(output).not.toContain('fakeSig');
    expect(output).not.toContain(`sentinel_board_token=s%3A`);

    // Les secrets entrants restent masqués (non-régression).
    expect(output).not.toContain('inbound-fake-value');
    expect(output).not.toContain('inbound-fake-bearer');
    expect(output).not.toContain('inbound-fake-origin-token');
    expect(output).not.toContain('inbound-fake-referer-token');

    // Les redactions sont visibles là où un secret existait.
    const parsed = JSON.parse(output.trim().split('\n').pop() as string);
    expect(parsed.req.headers.cookie).toBe('[Redacted]');
    expect(parsed.req.headers.authorization).toBe('[Redacted]');
    expect(parsed.req.headers.origin).toBe('[Redacted]');
    expect(parsed.req.headers.referer).toBe('[Redacted]');
    expect(parsed.res.headers['set-cookie']).toBe('[Redacted]');
  });

  it('conserve les métadonnées non sensibles dans le journal', async () => {
    const output = await captureRequestLog();
    const parsed = JSON.parse(output.trim().split('\n').pop() as string);

    expect(parsed.req.method).toBe('GET');
    expect(parsed.req.url).toBe('/api/board/session');
    expect(parsed.res.statusCode).toBe(200);
    expect(typeof parsed.responseTime).toBe('number');
  });
});
