import { readFileSync } from 'fs';
import path from 'path';
import type { NextFunction, Request, Response } from 'express';
import { securityHeaders } from '../securityHeaders';
import {
  BASE_SECURITY_HEADERS,
  CONTENT_SECURITY_POLICY,
  STRICT_TRANSPORT_SECURITY,
} from '../securityHeaderPolicy';

function runMiddleware(
  requestPath: string,
  nodeEnv?: string
): { setHeader: jest.Mock; next: jest.Mock } {
  const previous = process.env.NODE_ENV;
  if (nodeEnv !== undefined) process.env.NODE_ENV = nodeEnv;
  const setHeader = jest.fn();
  const next = jest.fn();
  try {
    securityHeaders(
      { path: requestPath } as Request,
      { setHeader } as unknown as Response,
      next as NextFunction
    );
  } finally {
    process.env.NODE_ENV = previous;
  }
  return { setHeader, next };
}

describe('securityHeaders', () => {
  it('pose les en-têtes de sécurité canoniques sur une réponse API publique', () => {
    const { setHeader } = runMiddleware('/api/health');
    for (const [name, value] of BASE_SECURITY_HEADERS) {
      expect(setHeader).toHaveBeenCalledWith(name, value);
    }
  });

  it('n’émet HSTS qu’en production (dépend du TLS d’extrémité)', () => {
    expect(runMiddleware('/api/health', 'production').setHeader).toHaveBeenCalledWith(
      'Strict-Transport-Security',
      STRICT_TRANSPORT_SECURITY
    );
    expect(runMiddleware('/api/health', 'test').setHeader).not.toHaveBeenCalledWith(
      'Strict-Transport-Security',
      expect.anything()
    );
  });
});

// Contrat anti-dérive (C-08) : le Nginx frontend est l'autorité des réponses
// statiques ; il DOIT servir exactement les mêmes valeurs canoniques que le
// backend. Ce test lit `frontend/nginx.conf` et échoue si une valeur diverge —
// c'est ce qui a été rattrapé (CSP `font-src` avait dérivé entre les deux).
describe('alignement des en-têtes Nginx frontend (anti-dérive C-08)', () => {
  const nginxConf = readFileSync(path.join(__dirname, '../../../../frontend/nginx.conf'), 'utf8');

  function nginxHeaderValues(headerName: string): string[] {
    const values: string[] = [];
    const pattern = new RegExp(`add_header\\s+${headerName}\\s+"([^"]*)"`, 'g');
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(nginxConf)) !== null) {
      values.push(match[1]);
    }
    return values;
  }

  it('sert au moins une fois chaque en-tête de sécurité canonique', () => {
    for (const [name] of BASE_SECURITY_HEADERS) {
      expect(nginxHeaderValues(name).length).toBeGreaterThan(0);
    }
  });

  it.each(BASE_SECURITY_HEADERS.map(([name, value]) => ({ name, value })))(
    'ne fait dériver aucune valeur de $name',
    ({ name, value }) => {
      for (const served of nginxHeaderValues(name)) {
        expect(served).toBe(value);
      }
    }
  );

  it('sert la même CSP que le backend (valeur exacte)', () => {
    for (const served of nginxHeaderValues('Content-Security-Policy')) {
      expect(served).toBe(CONTENT_SECURITY_POLICY);
    }
  });

  it('sert HSTS avec la même valeur canonique', () => {
    for (const served of nginxHeaderValues('Strict-Transport-Security')) {
      expect(served).toBe(STRICT_TRANSPORT_SECURITY);
    }
  });
});

describe('securityHeaders — cache', () => {
  it.each(['/api/auth/me', '/api/admin/dashboard', '/api/workshop/lines', '/api/board/data'])(
    'prevents caching for authenticated API space %s',
    (path) => {
      const { setHeader, next } = runMiddleware(path);

      expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
      expect(setHeader).toHaveBeenCalledWith('Pragma', 'no-cache');
      expect(setHeader).toHaveBeenCalledWith('Expires', '0');
      expect(next).toHaveBeenCalledTimes(1);
    }
  );

  it('does not force the public health endpoint out of cache', () => {
    const { setHeader } = runMiddleware('/api/health');

    expect(setHeader).not.toHaveBeenCalledWith('Cache-Control', 'no-store');
  });
});
