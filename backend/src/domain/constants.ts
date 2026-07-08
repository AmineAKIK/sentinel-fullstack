export const WORKSHOP_ROLES = ['OPERATOR', 'MAINTENANCE', 'RESPONSABLE'] as const;
export type WorkshopRole = (typeof WORKSHOP_ROLES)[number];

/**
 * Longueurs maximales des champs texte, source de vérité partagée entre les
 * schémas de validation. Empêche les saisies abusives et garde des données
 * propres et cohérentes.
 */
export const FIELD_LIMITS = {
  NAME: 80, // prénom, nom
  BADGE: 40, // numéro de badge
  IDENTIFIER: 80, // identifiant de connexion (badge ou username admin)
  MACHINE_ID: 50, // identifiant machine
  BRAND: 100, // marque machine
  ROBOT: 50, // numéro / label de robot
  LINE_NUMBER: 40, // numéro de ligne
  PRODUCT: 120, // produit en cours
  CODE: 100, // code d'accès board / code de configuration
  // Pour les mots de passe, voir MAX_PASSWORD_LENGTH dans auth/bcrypt.ts (source d'autorité).
  COMMENT: 500, // commentaire incident, consigne responsable, motifs
  NOTE: 1000, // diagnostic, note d'intervention
  SEARCH: 120, // requêtes de recherche / filtres
} as const;

/**
 * Fenêtre par défaut appliquée aux requêtes analytiques quand aucune borne
 * de date n'est fournie — évite un scan complet de workshop_incidents
 * (agrégations lourdes : percentiles, trend journalier).
 */
export const ANALYTICS_DEFAULT_WINDOW_DAYS = 90;

export const INCIDENT_STATES = [
  'SKIPEE_PAR_MACHINE',
  'SKIPEE_PAR_CONDUCTEUR',
  'DEGRADEE',
  'INDISPONIBLE',
] as const;
export type IncidentState = (typeof INCIDENT_STATES)[number];

export const INCIDENT_STATUSES = ['OPEN', 'PENDING', 'CLOSED', 'CANCELED', 'INVALIDATED'] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const ACTIVE_INCIDENT_STATUSES = ['OPEN', 'PENDING'] as const;
export type ActiveIncidentStatus = (typeof ACTIVE_INCIDENT_STATUSES)[number];

export const INCIDENT_ACTIONS = [
  'REQUEST_EDIT',
  'DIRECT_EDIT',
  'REQUEST_CANCEL',
  'APPROVE_CANCEL',
  'REJECT_CANCEL',
  'CANCEL',
  'APPROVE_EDIT',
  'REJECT_EDIT',
  'TAKE',
  'SET_PENDING',
  'RESUME',
  'CLOSE',
  'SET_PRIORITY',
  'RESPONSIBLE_COMMENT',
  'INVALIDATE_CLOSED',
  'EDIT_AFTER_TAKE',
  'RESPONSABLE_EDIT',
  'WITHDRAW_EDIT',
] as const;
export type IncidentAction = (typeof INCIDENT_ACTIONS)[number];

export function isWorkshopRole(value: string): value is WorkshopRole {
  return WORKSHOP_ROLES.includes(value as WorkshopRole);
}

export function isIncidentStatus(value: string): value is IncidentStatus {
  return INCIDENT_STATUSES.includes(value as IncidentStatus);
}

export function isIncidentState(value: string): value is IncidentState {
  return INCIDENT_STATES.includes(value as IncidentState);
}
