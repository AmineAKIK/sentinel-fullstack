import { Role, WorkshopIncident } from '../types';

/*
 * Permissions atelier côté UI (affichage/masquage des actions).
 *
 * ⚠️ MIROIR de backend/src/modules/workshop/workshop.policy.ts (`canPerform`).
 * Le backend reste la SEULE source de vérité en matière de sécurité : ce fichier
 * ne sert qu'à l'expérience (ne pas montrer un bouton dont l'action serait
 * refusée). Toute règle modifiée ici DOIT l'être aussi dans la policy backend,
 * et inversement — sinon un bouton s'affiche mais l'action renvoie 403.
 * Les noms d'action diffèrent par convention (camelCase ici, MAJUSCULES côté
 * back) mais les règles doivent rester identiques.
 */

export type WorkshopAction =
  | 'requestEdit'
  | 'directEdit'
  | 'editAfterTake'
  | 'responsableEdit'
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
  | 'responsibleComment'
  | 'invalidateClosed'
  | 'withdrawEdit'
  | 'withdrawCancel';

function isActiveIncident(incident: WorkshopIncident): boolean {
  return (
    incident.status !== 'CLOSED' &&
    incident.status !== 'CANCELED' &&
    incident.status !== 'INVALIDATED'
  );
}

function hasPendingArbitration(incident: WorkshopIncident): boolean {
  return (
    incident.edit_request != null ||
    incident.cancel_request === true ||
    incident.delete_request === true ||
    incident.arbitration?.edit != null ||
    incident.arbitration?.cancel != null
  );
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
      // OPERATOR can only correct their own declaration.
      return (
        role === 'OPERATOR' &&
        isActiveIncident(incident) &&
        !hasPendingArbitration(incident) &&
        actorId !== undefined &&
        incident.user_id === actorId
      );
    case 'withdrawEdit':
      return (
        role === 'OPERATOR' &&
        isActiveIncident(incident) &&
        incident.edit_request != null &&
        incident.arbitration?.cancel == null &&
        actorId !== undefined &&
        incident.user_id === actorId
      );
    case 'requestCancel':
      // OPERATOR can only cancel their own declaration, and only while untaken.
      return (
        role === 'OPERATOR' &&
        isActiveIncident(incident) &&
        !hasPendingArbitration(incident) &&
        !incident.is_taken &&
        actorId !== undefined &&
        incident.user_id === actorId
      );
    case 'withdrawCancel':
      // Le demandeur retire sa propre demande d'annulation tant qu'elle est en
      // attente (symétrique à withdrawEdit).
      return (
        role === 'OPERATOR' &&
        isActiveIncident(incident) &&
        incident.cancel_request === true &&
        actorId !== undefined &&
        incident.user_id === actorId
      );
    case 'directEdit':
      return (
        isActiveIncident(incident) &&
        !hasPendingArbitration(incident) &&
        !incident.is_taken &&
        (role === 'RESPONSABLE' || role === 'MAINTENANCE')
      );
    case 'responsableEdit':
      return (
        role === 'RESPONSABLE' && isActiveIncident(incident) && !hasPendingArbitration(incident)
      );
    case 'editAfterTake':
      return (
        role === 'MAINTENANCE' &&
        isActiveIncident(incident) &&
        !hasPendingArbitration(incident) &&
        incident.is_taken &&
        actorId !== undefined &&
        incident.taken_by_user_id === actorId
      );
    case 'cancel':
      if (incident.status === 'PENDING') {
        return role === 'RESPONSABLE' && !hasPendingArbitration(incident);
      }
      return (
        isActiveIncident(incident) &&
        !hasPendingArbitration(incident) &&
        !incident.is_taken &&
        (role === 'RESPONSABLE' || role === 'MAINTENANCE')
      );
    case 'approveEdit':
    case 'rejectEdit':
      return role === 'RESPONSABLE' && isActiveIncident(incident) && incident.edit_request != null;
    case 'approveCancel':
      return (
        role === 'RESPONSABLE' && isActiveIncident(incident) && incident.cancel_request === true
      );
    case 'rejectCancel':
      return (
        role === 'RESPONSABLE' && isActiveIncident(incident) && incident.cancel_request === true
      );
    case 'take':
      // Claim an OPEN incident, or transfer one owned by another technician.
      // The current owner must not be offered a no-op that would create a
      // misleading second TAKE event.
      return (
        role === 'MAINTENANCE' &&
        incident.status === 'OPEN' &&
        !hasPendingArbitration(incident) &&
        actorId !== undefined &&
        (!incident.is_taken || incident.taken_by_user_id !== actorId)
      );
    case 'setPending':
      return (
        role === 'MAINTENANCE' &&
        incident.status === 'OPEN' &&
        incident.is_taken &&
        !hasPendingArbitration(incident)
      );
    case 'resume':
      return (
        role === 'MAINTENANCE' &&
        incident.status === 'PENDING' &&
        incident.is_taken &&
        !hasPendingArbitration(incident)
      );
    case 'close':
      return (
        role === 'MAINTENANCE' &&
        incident.status === 'OPEN' &&
        incident.is_taken &&
        !hasPendingArbitration(incident)
      );
    case 'setPriority':
    case 'responsibleComment':
      return role === 'RESPONSABLE' && isActiveIncident(incident);
    case 'invalidateClosed':
      return role === 'RESPONSABLE' && incident.status === 'CLOSED';
    default:
      return false;
  }
}
