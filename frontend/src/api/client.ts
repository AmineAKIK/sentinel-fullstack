const configuredApiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
const API_URL = configuredApiUrl ? configuredApiUrl.replace(/\/$/, '') : '';
const DEFAULT_TIMEOUT_MS = 15_000;

function requestTimeoutMs(): number {
  const parsed = Number.parseInt(
    (import.meta.env.VITE_API_TIMEOUT_MS as string | undefined) ?? '',
    10
  );
  return Number.isInteger(parsed) && parsed >= 1_000 && parsed <= 120_000
    ? parsed
    : DEFAULT_TIMEOUT_MS;
}

export class ApiResponseError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ApiResponseError';
    this.code = code;
    this.status = status;
  }
}

export function apiErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiResponseError ? error.message : fallback;
}

let onUnauthorized: (() => void) | null = null;
export function setOn401Handler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  signal?: AbortSignal
): Promise<T> {
  const abortController = new AbortController();
  let timedOut = false;
  const forwardAbort = (): void => abortController.abort(signal?.reason);
  if (signal?.aborted) forwardAbort();
  else signal?.addEventListener('abort', forwardAbort, { once: true });
  const timeout = window.setTimeout(() => {
    timedOut = true;
    abortController.abort();
  }, requestTimeoutMs());

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      credentials: 'include',
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: abortController.signal,
    });
  } catch (error) {
    if (timedOut) {
      throw new ApiResponseError(
        'REQUEST_TIMEOUT',
        'Le serveur met trop de temps à répondre. Réessayez.',
        408
      );
    }
    if (signal?.aborted) throw error;
    throw new ApiResponseError(
      'NETWORK_ERROR',
      'Connexion au serveur impossible. Vérifiez le réseau puis réessayez.',
      0
    );
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener('abort', forwardAbort);
  }

  if (!res.ok) {
    if (res.status === 401) onUnauthorized?.();

    let code = 'SERVER_ERROR';
    let message = 'Une erreur est survenue.';
    try {
      const data = (await res.json()) as { error?: { code?: string; message?: string } };
      if (data?.error?.code) code = data.error.code;
      if (data?.error?.message) message = data.error.message;
    } catch {
      // Le contrat d'erreur de secours reste volontairement générique.
    }
    throw new ApiResponseError(code, message, res.status);
  }

  if (res.status === 204 || res.headers.get('content-length') === '0') return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>('GET', path, undefined, signal),
  post: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    request<T>('POST', path, body, signal),
  patch: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    request<T>('PATCH', path, body, signal),
  delete: <T>(path: string, signal?: AbortSignal) => request<T>('DELETE', path, undefined, signal),
};
