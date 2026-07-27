export const ROLE_LABELS: Record<string, string> = {
  OPERATOR: 'Opérateur',
  MAINTENANCE: 'Technicien',
  RESPONSABLE: 'Responsable',
};

export const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Ouvert',
  PENDING: 'En attente',
  CLOSED: 'Clôturé',
  CANCELED: 'Annulé',
  INVALIDATED: 'Invalidé',
};

export const STATE_LABELS: Record<string, string> = {
  SKIPEE_PAR_MACHINE: 'Skip machine',
  SKIPEE_PAR_CONDUCTEUR: 'Skip opérateur',
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
  ADMIN_PASSWORD_CHANGED: 'Mot de passe admin modifié',
  ADMIN_EMAIL_CHANGED: 'Email admin modifié',
  ADMIN_NOTIF_UPDATED: 'Préférences notifications modifiées',
  BOARD_TOGGLED: 'Board activé / désactivé',
  BOARD_CODE_CHANGED: 'Code board modifié',
  APP_SETTINGS_CHANGED: 'Paramètres application modifiés',
  SESSIONS_REVOKED: 'Sessions révoquées',
  PASSWORD_RESET_REQUEST_HANDLED: 'Demande de reset traitée',
};

export interface AuditEventTarget {
  scope?: string;
  line_number?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  badge_number?: string | null;
}

export function formatAuditEventTarget(event: AuditEventTarget, includeBadge = false): string {
  if (event.scope === 'system') return 'Système';
  if (event.scope === 'line') return event.line_number || 'Ligne archivée';
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
  CANCEL_REQUEST_WITHDRAWN: 'Annulation retirée',
  DELETE_REQUESTED: 'Annulation demandée',
  DELETE_REQUEST_REJECTED: 'Annulation refusée',
  PRIORITY_CHANGED: 'Priorité modifiée',
  ORDER_CHANGED: 'Réordonnancement',
  RESPONSIBLE_COMMENT_UPDATED: 'Consigne responsable',
  STATUS_CHANGED: 'Statut modifié',
  ARBITRATION_CONSULTED: "Dossier d'arbitrage consulté",
};
