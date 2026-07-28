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

describe('Nginx hôte RC4 — autorité unique et compatibilité 1.18', () => {
  const repositoryRoot = path.join(__dirname, '../../../..');
  const hostNginxPath = path.join(repositoryRoot, 'deploy/nginx/sentinel.conf.example');
  const hostNginx = readFileSync(hostNginxPath, 'utf8');

  it('versionne exactement une barrière d’héritage vide au niveau du serveur HTTPS', () => {
    expect(hostNginx.match(/add_header X-Sentinel-Inheritance-Barrier "";/g) ?? []).toHaveLength(1);
    expect(hostNginx).toMatch(
      /server\s*\{[\s\S]*listen 443[\s\S]*add_header X-Sentinel-Inheritance-Barrier "";/
    );
  });

  it('emploie la syntaxe HTTP/2 comprise par Nginx 1.18.0', () => {
    expect(hostNginx).not.toMatch(/^\s*http2\s+on\s*;/m);
    expect(hostNginx).toContain('listen 443 ssl http2;');
    expect(hostNginx).toContain('listen [::]:443 ssl http2;');
  });

  it('versionne les contrôles public et d’héritage réellement exécutables', () => {
    const publicVerifier = path.join(repositoryRoot, 'scripts/verify-public-headers.sh');
    const inheritanceTest = path.join(repositoryRoot, 'scripts/test-nginx-header-inheritance.sh');
    const workflow = readFileSync(path.join(repositoryRoot, '.github/workflows/ci.yml'), 'utf8');
    const publicVerifierSource = readFileSync(publicVerifier, 'utf8');
    const inheritanceTestSource = readFileSync(inheritanceTest, 'utf8');

    for (const path of ['/login', '/api/health']) {
      expect(publicVerifierSource).toContain(path);
    }
    for (const headerName of [
      'Strict-Transport-Security',
      'Content-Security-Policy',
      'X-Content-Type-Options',
      'X-Frame-Options',
      'Referrer-Policy',
      'Permissions-Policy',
      'X-Sentinel-Inheritance-Barrier',
    ]) {
      expect(publicVerifierSource).toContain(headerName);
    }
    expect(inheritanceTestSource).toContain('X-Sentinel-Global-Probe');
    expect(inheritanceTestSource).toContain('nginx/1.18.0');
    expect(workflow).toContain('nginx:1.18.0 nginx -t');
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
