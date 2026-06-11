export const ROLE_LABELS: Record<string, string> = {
  OPERATOR: 'Opérateur',
  MAINTENANCE: 'Technicien',
  RESPONSABLE: 'Responsable',
};

export const SHIFT_LABELS: Record<string, string> = {
  MATIN: 'Matin',
  APRES_MIDI: 'Après-midi',
  NUIT: 'Nuit',
  WEEKEND: 'Weekend',
};

export const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Ouvert',
  PENDING: 'En attente',
  CLOSED: 'Clôturé',
  CANCELED: 'Annulé',
  INVALIDATED: 'Invalidé',
};

export const STATE_LABELS: Record<string, string> = {
  SKIPEE_PAR_MACHINE: 'Skipée par machine',
  SKIPEE_PAR_CONDUCTEUR: 'Skipée par conducteur',
  DEGRADEE: 'Dégradée',
  INDISPONIBLE: 'Indisponible',
};

export const ADMIN_EVENT_LABELS: Record<string, string> = {
  USER_CREATED: 'Utilisateur créé',
  USER_UPDATED: 'Utilisateur modifié',
  USER_ACTIVATED: 'Utilisateur activé',
  USER_DEACTIVATED: 'Utilisateur désactivé',
  USER_SOFT_DELETED: 'Utilisateur supprimé',
  USER_PASSWORD_RESET: 'Mot de passe réinitialisé',
  LINE_CREATED: 'Ligne créée',
  LINE_UPDATED: 'Ligne mise à jour',
  LINE_SUMMARY_UPDATED: 'Informations ligne modifiées',
  LINE_MACHINE_UPDATED: 'Machine modifiée',
  LINE_PLAN_UPDATED: 'Ordre machines modifié',
  LINE_SOFT_DELETED: 'Ligne supprimée',
};

export interface AuditEventTarget {
  scope?: string;
  line_number?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  badge_number?: string | null;
}

export function formatAuditEventTarget(event: AuditEventTarget, includeBadge = false): string {
  if (event.scope === 'line') return event.line_number || 'Ligne supprimée';
  const name = `${event.first_name || ''} ${event.last_name || ''}`.trim();
  if (includeBadge && event.badge_number) return `${name || 'Utilisateur'} (${event.badge_number})`;
  return name || 'Utilisateur';
}

export const WORKSHOP_EVENT_LABELS: Record<string, string> = {
  INCIDENT_CREATED: 'Incident signalé',
  INCIDENT_TAKEN: 'Prise en charge',
  INCIDENT_SET_PENDING: 'Suspendu',
  INCIDENT_RESUMED: 'Reprise en cours',
  INCIDENT_CLOSED: 'Clôturé',
  INCIDENT_CANCELED: 'Incident annulé',
  INCIDENT_INVALIDATED: 'Incident invalidé',
  INCIDENT_FOLLOWED: 'Suivi ajouté',
  INCIDENT_UNFOLLOWED: 'Suivi retiré',
  INCIDENT_UPDATED: 'Incident modifié',
  INCIDENT_REORDERED: 'Réordonnancement',
  EDIT_REQUESTED: 'Correction demandée',
  EDIT_APPLIED: 'Correction appliquée',
  EDIT_REJECTED: 'Correction refusée',
  EDIT_REQUEST_WITHDRAWN: 'Correction retirée',
  CANCEL_REQUESTED: 'Annulation demandée',
  CANCEL_REQUEST_REJECTED: 'Annulation refusée',
  DELETE_REQUESTED: 'Annulation demandée',
  DELETE_REQUEST_REJECTED: 'Annulation refusée',
  PRIORITY_CHANGED: 'Priorité modifiée',
  ORDER_CHANGED: 'Réordonnancement',
  RESPONSIBLE_COMMENT_UPDATED: 'Consigne responsable',
  STATUS_CHANGED: 'Statut modifié',
};
