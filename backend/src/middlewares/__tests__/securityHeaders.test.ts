import type { NextFunction, Request, Response } from 'express';
import { securityHeaders } from '../securityHeaders';

function runMiddleware(path: string): { setHeader: jest.Mock; next: jest.Mock } {
  const setHeader = jest.fn();
  const next = jest.fn();
  securityHeaders({ path } as Request, { setHeader } as unknown as Response, next as NextFunction);
  return { setHeader, next };
}

describe('securityHeaders', () => {
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
