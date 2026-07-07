import { IncidentAction, IncidentStatus, isWorkshopRole } from '../../domain/constants';

/*
 * Permissions atelier — SOURCE DE VÉRITÉ en matière de sécurité (`canPerform`).
 * Appliquée par chaque mutation du service avant toute action ; le frontend en
 * tient un MIROIR pour l'UX dans frontend/src/utils/workshopPermissions.ts.
 * Toute règle modifiée ici DOIT l'être aussi côté front (et inversement), sinon
 * l'interface et le serveur divergent. Les noms d'action diffèrent par
 * convention (MAJUSCULES ici, camelCase côté front) mais les règles sont
 * identiques.
 */

export interface CurrentIncident {
  status: IncidentStatus;
  is_taken: boolean;
  taken_by_user_id: number | null;
  user_id: number;
  cancel_request?: boolean;
  // delete_request is a legacy alias for cancel_request kept for DB compatibility.
  delete_request?: boolean;
  edit_request?: unknown | null;
}

export function isActiveIncident(incident: CurrentIncident): boolean {
  return (
    incident.status !== 'CLOSED' &&
    incident.status !== 'CANCELED' &&
    incident.status !== 'INVALIDATED'
  );
}

function hasCancelRequest(incident: CurrentIncident): boolean {
  return incident.cancel_request === true || incident.delete_request === true;
}

export function canPerform(
  role: string,
  action: IncidentAction,
  incident: CurrentIncident,
  actorId?: number
): boolean {
  if (!isWorkshopRole(role)) return false;
  const workshopRole = role;

  switch (action) {
    case 'REQUEST_EDIT':
      // OPERATOR can only correct their own declaration.
      return (
        workshopRole === 'OPERATOR' &&
        isActiveIncident(incident) &&
        actorId !== undefined &&
        incident.user_id === actorId
      );
    case 'WITHDRAW_EDIT':
      // OPERATOR can withdraw their own edit request (same ownership check as REQUEST_EDIT).
      return (
        workshopRole === 'OPERATOR' &&
        isActiveIncident(incident) &&
        incident.edit_request != null &&
        actorId !== undefined &&
        incident.user_id === actorId
      );
    case 'REQUEST_CANCEL':
      // OPERATOR can only cancel their own declaration, and only while untaken.
      // Once MAINTENANCE takes it, cancellation goes through RESPONSABLE approval.
      return (
        workshopRole === 'OPERATOR' &&
        isActiveIncident(incident) &&
        !incident.is_taken &&
        actorId !== undefined &&
        incident.user_id === actorId
      );
    case 'DIRECT_EDIT':
      return (
        isActiveIncident(incident) &&
        !incident.is_taken &&
        (workshopRole === 'RESPONSABLE' || workshopRole === 'MAINTENANCE')
      );
    case 'RESPONSABLE_EDIT':
      // RESPONSABLE can edit descriptive fields even after a technician has taken the incident.
      return workshopRole === 'RESPONSABLE' && isActiveIncident(incident);
    case 'EDIT_AFTER_TAKE':
      // MAINTENANCE can edit descriptive fields on incidents they personally took charge of.
      return (
        workshopRole === 'MAINTENANCE' &&
        isActiveIncident(incident) &&
        incident.is_taken &&
        actorId !== undefined &&
        incident.taken_by_user_id === actorId
      );
    case 'CANCEL':
      // PENDING incidents can be cancelled by RESPONSABLE (not MAINTENANCE) since
      // the technician has already engaged — a supervisor override is required.
      if (incident.status === 'PENDING') {
        return workshopRole === 'RESPONSABLE';
      }
      return (
        isActiveIncident(incident) &&
        !incident.is_taken &&
        (workshopRole === 'RESPONSABLE' || workshopRole === 'MAINTENANCE')
      );
    case 'APPROVE_EDIT':
    case 'REJECT_EDIT':
      return (
        workshopRole === 'RESPONSABLE' &&
        isActiveIncident(incident) &&
        incident.edit_request != null
      );
    case 'APPROVE_CANCEL':
    case 'REJECT_CANCEL':
      return (
        workshopRole === 'RESPONSABLE' && isActiveIncident(incident) && hasCancelRequest(incident)
      );
    case 'TAKE':
      // Any MAINTENANCE member can take or retake an OPEN incident at any time.
      // Technicians are autonomous — the ball changes feet, every transfer is logged.
      return workshopRole === 'MAINTENANCE' && incident.status === 'OPEN';
    case 'SET_PENDING':
      return workshopRole === 'MAINTENANCE' && incident.status === 'OPEN' && incident.is_taken;
    case 'RESUME':
      // Any MAINTENANCE member can resume, not just the one who set it PENDING.
      // Intentional: allows a replacement technician to take over if needed.
      return workshopRole === 'MAINTENANCE' && incident.status === 'PENDING' && incident.is_taken;
    case 'CLOSE':
      // Any MAINTENANCE member can close, not just taken_by_user_id.
      // Intentional: allows a replacement technician to take over if needed.
      return workshopRole === 'MAINTENANCE' && incident.status === 'OPEN' && incident.is_taken;
    case 'SET_PRIORITY':
    case 'RESPONSIBLE_COMMENT':
      return workshopRole === 'RESPONSABLE' && isActiveIncident(incident);
    case 'INVALIDATE_CLOSED':
      return workshopRole === 'RESPONSABLE' && incident.status === 'CLOSED';
    default:
      return false;
  }
}
