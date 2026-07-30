import type { Request } from 'express';
import type { RequestHandler } from 'express';
import { parseClientOrigin } from '../config/production';
import { sendError } from '../utils/errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const ALLOWED_FETCH_SITES = new Set(['same-origin', 'same-site', 'none']);

type HeaderValue =
  { state: 'missing' } | { state: 'invalid' } | { state: 'present'; value: string };

function readSingleHeader(
  req: Request,
  name: 'origin' | 'referer' | 'sec-fetch-site'
): HeaderValue {
  const rawValues: string[] = [];
  for (let index = 0; index < req.rawHeaders.length; index += 2) {
    if (req.rawHeaders[index]?.toLowerCase() === name) {
      rawValues.push(req.rawHeaders[index + 1] ?? '');
    }
  }
  if (rawValues.length === 0) return { state: 'missing' };
  if (rawValues.length !== 1) return { state: 'invalid' };
  const raw = rawValues[0];

  // Node normally combines duplicate request headers. A comma is not valid in
  // Origin or Fetch Metadata and is rejected conservatively in Referer too, so
  // a list can never be mistaken for one trusted value.
  if (!raw || raw.trim() !== raw || raw.includes(',')) return { state: 'invalid' };
  return { state: 'present', value: raw };
}

function hasExactReferer(referer: string, clientOrigin: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(referer);
  } catch {
    return false;
  }
  return !parsed.username && !parsed.password && parsed.origin === clientOrigin;
}

function hasTrustedProvenance(req: Request, clientOrigin: string): boolean {
  const origin = readSingleHeader(req, 'origin');
  if (origin.state !== 'missing') {
    return origin.state === 'present' && origin.value === clientOrigin;
  }

  const referer = readSingleHeader(req, 'referer');
  return referer.state === 'present' && hasExactReferer(referer.value, clientOrigin);
}

function hasAllowedFetchMetadata(req: Request): boolean {
  const fetchSite = readSingleHeader(req, 'sec-fetch-site');
  if (fetchSite.state === 'missing') return true;
  return fetchSite.state === 'present' && ALLOWED_FETCH_SITES.has(fetchSite.value);
}

/**
 * Central CSRF guard for every state- or session-changing API request.
 *
 * `same-site` Fetch Metadata is deliberately not a trust decision: sibling
 * origins can be same-site. Origin (or Referer as fallback) must still prove
 * the one configured frontend origin. Requests without either proof are
 * refused in every environment; Sentinel has no mutating non-browser client.
 */
export function createCsrfProtection(configuredClientOrigin: string): RequestHandler {
  const clientOrigin = parseClientOrigin(configuredClientOrigin);

  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }

    if (!hasTrustedProvenance(req, clientOrigin) || !hasAllowedFetchMetadata(req)) {
      sendError(res, 403, 'FORBIDDEN', 'Requête refusée.');
      return;
    }

    next();
  };
}
