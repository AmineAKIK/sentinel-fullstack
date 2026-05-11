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
  delete_request?: boolean;
}

export function isActiveIncident(incident: CurrentIncident): boolean {
  return incident.status !== 'CLOSED' && incident.status !== 'CANCELED';
}

export function canPerform(role: string, action: IncidentAction, incident: CurrentIncident): boolean {
  if (!isWorkshopRole(role)) return false;
  const workshopRole = role as WorkshopRole;

  switch (action) {
    case 'REQUEST_EDIT':
      return workshopRole === 'OPERATOR' && isActiveIncident(incident);
    case 'REQUEST_CANCEL':
      return workshopRole === 'OPERATOR' && isActiveIncident(incident) && !incident.is_taken;
    case 'DIRECT_EDIT':
      return isActiveIncident(incident) && !incident.is_taken && (
        workshopRole === 'RESPONSABLE' || workshopRole === 'MAINTENANCE'
      );
    case 'CANCEL':
      return isActiveIncident(incident) && !incident.is_taken && (
        workshopRole === 'RESPONSABLE' || workshopRole === 'MAINTENANCE'
      );
    case 'APPROVE_EDIT':
    case 'REJECT_EDIT':
      return workshopRole === 'RESPONSABLE' && isActiveIncident(incident);
    case 'APPROVE_CANCEL':
      return workshopRole === 'RESPONSABLE' && isActiveIncident(incident) && incident.delete_request === true;
    case 'REJECT_CANCEL':
      return workshopRole === 'RESPONSABLE' && isActiveIncident(incident);
    case 'TAKE':
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
