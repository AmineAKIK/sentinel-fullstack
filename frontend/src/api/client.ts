const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000';

export class ApiResponseError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// Callback global déclenché sur tout 401 — branché par AppAuthContext au montage.
// Permet de délogguer l'utilisateur sans couplage direct entre le client HTTP
// et le contexte React (qui ne serait pas accessible ici sans hook).
let _on401: (() => void) | null = null;
let _redirecting = false;

export function setOn401Handler(handler: () => void) {
  _on401 = handler;
  _redirecting = false;
}

export function isRedirecting(): boolean {
  return _redirecting;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    // 401 global : session expirée ou révoquée — logout immédiat (une seule fois)
    if (res.status === 401 && _on401 && !_redirecting) {
      _redirecting = true;
      _on401();
    }

    let code = 'SERVER_ERROR';
    let message = 'Une erreur est survenue.';
    try {
      const data = (await res.json()) as { error?: { code?: string; message?: string } };
      if (data?.error?.code) code = data.error.code;
      if (data?.error?.message) message = data.error.message;
    } catch {
      // ignore parse error
    }
    throw new ApiResponseError(code, message, res.status);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
