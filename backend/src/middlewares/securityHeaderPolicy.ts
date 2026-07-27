/**
 * Source unique et canonique des valeurs d'en-têtes de sécurité publics (C-08).
 *
 * Deux autorités les posent, sur des réponses DISJOINTES :
 *  - le Nginx frontend (`frontend/nginx.conf`) pour le document applicatif et
 *    les fichiers statiques servis sur `:8080` ;
 *  - ce middleware Express pour les réponses API `/api/*` servies sur `:3000`.
 *
 * Le proxy d'entrée (Caddy, ou le Nginx hôte en topologie B) ne fait que du
 * reverse-proxy et n'ajoute AUCUN de ces en-têtes — il n'y a donc jamais deux
 * exemplaires du même en-tête sur une seule réponse. Le risque réel est la
 * DÉRIVE entre les deux copies : ce module fige la valeur effective unique, et
 * un test de contrat (`securityHeaderPolicy.test.ts`) vérifie que le Nginx
 * frontend sert exactement ces mêmes valeurs.
 *
 * La CSP autorise `font-src 'self' data:` car l'application intègre ses polices
 * en data-URI (aucune police distante) ; retirer `data:` casserait les polices.
 */
export const CONTENT_SECURITY_POLICY =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none';";

export const STRICT_TRANSPORT_SECURITY = 'max-age=31536000; includeSubDomains';

// En-têtes posés sur toute réponse, quelle que soit l'autorité.
export const BASE_SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ['X-Content-Type-Options', 'nosniff'],
  ['X-Frame-Options', 'DENY'],
  ['Referrer-Policy', 'no-referrer'],
  ['Permissions-Policy', 'camera=(), microphone=(), geolocation=()'],
  ['Content-Security-Policy', CONTENT_SECURITY_POLICY],
];
