import { Response } from 'express';

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'REAUTHENTICATION_FAILED'
  | 'SESSION_REVOKED'
  | 'FORBIDDEN'
  | 'WORKSHOP_ACCOUNT_DISABLED'
  | 'NOT_FOUND'
  | 'BADGE_ALREADY_EXISTS'
  | 'LINE_ALREADY_EXISTS'
  | 'MACHINE_ALREADY_EXISTS'
  | 'RESOURCE_IN_USE'
  | 'LINE_HAS_ACTIVE_INCIDENTS'
  | 'ARBITRATION_REQUIRED'
  | 'ARBITRATION_ALREADY_PENDING'
  | 'NO_CHANGES'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'SERVICE_UNAVAILABLE';

/**
 * Champs SÉMANTIQUES publics. Ce sont des identifiants d'UI stables, jamais des
 * noms de colonnes SQL ni des clés internes en snake_case. Le frontend s'en sert
 * pour rattacher une erreur à un champ (focus, message de proximité) et pour
 * choisir un libellé — il ne les affiche JAMAIS tels quels.
 */
export type PublicField =
  | 'boardSessionDuration'
  | 'adminSessionDuration'
  | 'workshopSessionDuration'
  | 'loginMaxAttempts'
  | 'setupCodeDuration'
  | 'boardLabel'
  | 'decisionReason';

/**
 * Raisons STABLES et publiques. Elles décrivent la nature de l'erreur sans
 * révéler d'implémentation. Le frontend traduit (code, field, reason) en
 * français ; ces valeurs ne sont jamais affichées telles quelles.
 */
export type ErrorReason =
  'OUT_OF_RANGE' | 'REQUIRED' | 'TOO_LONG' | 'INVALID_FORMAT' | 'NO_CHANGES';

export interface ErrorDetails {
  field?: PublicField;
  reason?: ErrorReason;
  /** Bornes, uniquement lorsqu'elles sont utiles et non sensibles. */
  min?: number;
  max?: number;
}

export interface ApiError {
  error: {
    code: ErrorCode;
    message: string;
    details?: ErrorDetails;
  };
}

/**
 * Message générique SÛR renvoyé par défaut pour une erreur de validation. Il ne
 * contient aucun identifiant interne : le libellé précis est reconstruit côté
 * client à partir de (code + details). Utiliser ce message évite que le backend
 * fabrique un texte exposant un nom de champ.
 */
export const PUBLIC_ERROR_MESSAGE = 'Une valeur est invalide.';

/**
 * Envoie une erreur au format public. `details` est optionnel et n'est joint que
 * s'il est fourni : sans lui, le corps reste `{ error: { code, message } }`
 * (rétrocompatible avec les clients existants).
 */
export function sendError(
  res: Response,
  status: number,
  code: ErrorCode,
  message: string,
  details?: ErrorDetails
): void {
  const error: ApiError['error'] = { code, message };
  if (details && Object.keys(details).length > 0) {
    error.details = details;
  }
  res.status(status).json({ error });
}
