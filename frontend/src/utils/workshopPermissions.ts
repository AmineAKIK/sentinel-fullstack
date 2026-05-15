import { Role, WorkshopIncident } from '../types';

export type WorkshopAction =
  | 'requestEdit'
  | 'directEdit'
  | 'editAfterTake'
  | 'requestCancel'
  | 'cancel'
  | 'approveEdit'
  | 'rejectEdit'
  | 'approveCancel'
  | 'rejectCancel'
  | 'take'
  | 'setPending'
  | 'resume'
  | 'close'
  | 'setPriority'
  | 'reorder'
  | 'responsibleComment'
  | 'invalidateClosed';

function isActiveIncident(incident: WorkshopIncident): boolean {
  return incident.status !== 'CLOSED' && incident.status !== 'CANCELED' && incident.status !== 'INVALIDATED';
}

export function canPerform(
  role: Role | undefined,
  action: WorkshopAction,
  incident: WorkshopIncident,
  actorId?: number
): boolean {
  if (!role) return false;

  switch (action) {
    case 'requestEdit':
      return role === 'OPERATOR' && isActiveIncident(incident);
    case 'requestCancel':
      return role === 'OPERATOR' && isActiveIncident(incident) && !incident.is_taken;
    case 'directEdit':
      return isActiveIncident(incident) && !incident.is_taken && (role === 'RESPONSABLE' || role === 'MAINTENANCE');
    case 'editAfterTake':
      return (
        role === 'MAINTENANCE' &&
        isActiveIncident(incident) &&
        incident.is_taken &&
        actorId !== undefined &&
        incident.taken_by_user_id === actorId
      );
    case 'cancel':
      return isActiveIncident(incident) && !incident.is_taken && (role === 'RESPONSABLE' || role === 'MAINTENANCE');
    case 'approveEdit':
    case 'rejectEdit':
      return role === 'RESPONSABLE' && isActiveIncident(incident) && incident.edit_request != null;
    case 'approveCancel':
      return role === 'RESPONSABLE' && isActiveIncident(incident) && incident.cancel_request === true;
    case 'rejectCancel':
      return role === 'RESPONSABLE' && isActiveIncident(incident) && incident.cancel_request === true;
    case 'take':
      return role === 'MAINTENANCE' && incident.status === 'OPEN' && !incident.is_taken;
    case 'setPending':
      return role === 'MAINTENANCE' && incident.status === 'OPEN' && incident.is_taken;
    case 'resume':
      return role === 'MAINTENANCE' && incident.status === 'PENDING' && incident.is_taken;
    case 'close':
      return role === 'MAINTENANCE' && incident.status === 'OPEN' && incident.is_taken;
    case 'setPriority':
    case 'reorder':
    case 'responsibleComment':
      return role === 'RESPONSABLE' && isActiveIncident(incident);
    case 'invalidateClosed':
      return role === 'RESPONSABLE' && incident.status === 'CLOSED';
    default:
      return false;
  }
}
