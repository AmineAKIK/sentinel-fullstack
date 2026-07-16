import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiResponseError, setOn401Handler } from '../client';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  setOn401Handler(null);
});

describe('API client', () => {
  it('utilise l’API same-origin et transmet les cookies', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.get<{ ok: boolean }>('/api/test')).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/test$/),
      expect.objectContaining({ method: 'GET', credentials: 'include' })
    );
  });

  it('préserve le code et le message d’une erreur métier', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ error: { code: 'CONFLICT', message: 'État concurrent.' } }),
            { status: 409, headers: { 'content-type': 'application/json' } }
          )
        )
    );

    await expect(api.patch('/api/test', { value: 1 })).rejects.toMatchObject({
      name: 'ApiResponseError',
      code: 'CONFLICT',
      message: 'État concurrent.',
      status: 409,
    });
  });

  it('déclenche une seule voie globale sur une session expirée', async () => {
    const onUnauthorized = vi.fn();
    setOn401Handler(onUnauthorized);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));

    await expect(api.get('/api/private')).rejects.toBeInstanceOf(ApiResponseError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('transforme une panne réseau en erreur exploitable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(api.get('/api/test')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      status: 0,
    });
  });

  it('annule une requête qui dépasse le délai maximal', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
            );
          })
      )
    );

    const assertion = expect(api.get('/api/slow')).rejects.toMatchObject({
      code: 'REQUEST_TIMEOUT',
      status: 408,
    });
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
  });
});
