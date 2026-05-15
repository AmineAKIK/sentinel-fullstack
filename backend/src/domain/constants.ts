export const WORKSHOP_ROLES = ['OPERATOR', 'MAINTENANCE', 'RESPONSABLE'] as const;
export type WorkshopRole = (typeof WORKSHOP_ROLES)[number];

export const INCIDENT_SHIFTS = ['MATIN', 'APRES_MIDI', 'NUIT', 'WEEKEND'] as const;
export type IncidentShift = (typeof INCIDENT_SHIFTS)[number];

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
  'REORDER',
  'RESPONSIBLE_COMMENT',
  'INVALIDATE_CLOSED',
  'EDIT_AFTER_TAKE',
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
