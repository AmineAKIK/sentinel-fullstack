import type { Request, Response, NextFunction } from 'express';
import { loginLimiter } from '../loginRateLimit';

// ── helpers ─────────────────────────────────────────────────────────────────

function mockReq(identifier: string, ip = '10.0.0.1'): Request {
  return { method: 'POST', path: '/api/auth/login', baseUrl: '', ip, socket: {}, body: { identifier } } as unknown as Request;
}

interface MockRes {
  res: Response;
  statusCode: number | null;
  headers: Record<string, string>;
}

function mockRes(): MockRes {
  const state: MockRes = { res: {} as Response, statusCode: null, headers: {} };
  const res: Record<string, unknown> = {};
  res.status = (code: number) => { state.statusCode = code; return res; };
  res.json = () => res;
  res.setHeader = (name: string, value: string) => { state.headers[name] = value; return res; };
  state.res = res as unknown as Response;
  return state;
}

function attempt(req: Request): { blocked: boolean; status: number | null } {
  const m = mockRes();
  let passed = false;
  const next: NextFunction = () => { passed = true; };
  loginLimiter.middleware(req, m.res, next);
  return { blocked: !passed, status: m.statusCode };
}

// Le seuil réel du loginLimiter (cf. loginRateLimit.ts).
const MAX = 10;

describe('loginLimiter', () => {
  beforeEach(() => {
    // Chaque test repart d'un identifiant unique pour ne pas partager l'état du
    // store en mémoire (singleton) entre les cas.
  });

  it('laisse passer tant que le seuil d\'échecs n\'est pas atteint', () => {
    const req = mockReq('user-a');
    // Premier passage : autorisé.
    expect(attempt(req).blocked).toBe(false);
    // On simule des échecs sous le seuil.
    for (let i = 0; i < MAX - 1; i++) loginLimiter.recordFailure(req);
    expect(attempt(req).blocked).toBe(false);
  });

  it('bloque (429) une fois le seuil d\'échecs dépassé', () => {
    const req = mockReq('user-b');
    for (let i = 0; i < MAX; i++) loginLimiter.recordFailure(req);
    const r = attempt(req);
    expect(r.blocked).toBe(true);
    expect(r.status).toBe(429);
  });

  it('un login réussi (clear) remet le compteur à zéro', () => {
    const req = mockReq('user-c');
    for (let i = 0; i < MAX; i++) loginLimiter.recordFailure(req);
    expect(attempt(req).blocked).toBe(true);

    loginLimiter.clear(req);
    expect(attempt(req).blocked).toBe(false);
  });

  it('isole les compteurs par identifiant (pas de blocage croisé)', () => {
    const victim = mockReq('user-d');
    const other = mockReq('user-e');
    // « other » épuise son quota…
    for (let i = 0; i < MAX; i++) loginLimiter.recordFailure(other);
    expect(attempt(other).blocked).toBe(true);
    // … « victim » sur la même IP n'est pas affecté.
    expect(attempt(victim).blocked).toBe(false);
  });
});
