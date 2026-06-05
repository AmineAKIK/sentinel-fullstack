import {
  IncidentAction,
  IncidentStatus,
  isWorkshopRole,
  WorkshopRole,
} from '../../domain/constants';

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
  const workshopRole = role as WorkshopRole;

  switch (action) {
    case 'REQUEST_EDIT':
      // OPERATOR can only correct their own declaration.
      return (
        workshopRole === 'OPERATOR' &&
        isActiveIncident(incident) &&
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
        workshopRole === 'RESPONSABLE' &&
        isActiveIncident(incident) &&
        hasCancelRequest(incident)
      );
    case 'TAKE':
      // Reserved for MAINTENANCE only — RESPONSABLE monitors but does not intervene.
      return workshopRole === 'MAINTENANCE' && incident.status === 'OPEN' && !incident.is_taken;
    case 'SET_PENDING':
      return workshopRole === 'MAINTENANCE' && incident.status === 'OPEN' && incident.is_taken;
    case 'RESUME':
      return workshopRole === 'MAINTENANCE' && incident.status === 'PENDING' && incident.is_taken;
    case 'CLOSE':
      return workshopRole === 'MAINTENANCE' && incident.status === 'OPEN' && incident.is_taken;
    case 'SET_PRIORITY':
    case 'REORDER':
    case 'RESPONSIBLE_COMMENT':
      return workshopRole === 'RESPONSABLE' && isActiveIncident(incident);
    case 'INVALIDATE_CLOSED':
      return workshopRole === 'RESPONSABLE' && incident.status === 'CLOSED';
    default:
      return false;
  }
}
