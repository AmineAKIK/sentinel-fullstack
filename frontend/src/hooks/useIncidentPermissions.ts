import { WorkshopIncident } from '../types';
import { Role } from '../types/common';
import { canPerform } from '../utils/workshopPermissions';
import { isIncidentResolved } from '../components/IncidentBadges';

/**
 * Dérive toutes les permissions et groupes d'actions utiles à l'affichage
 * du dossier incident, à partir des 13 vérifications canPerform. Centralise
 * ce qui était calculé en série dans IncidentDetailPanel.
 */
export function useIncidentPermissions(
  incident: WorkshopIncident,
  userRole: Role | undefined,
  userId: number | undefined,
  isResponsable: boolean
) {
  const canRequestEdit = canPerform(userRole, 'requestEdit', incident, userId);
  const canDirectEdit = canPerform(userRole, 'directEdit', incident);
  const canResponsableEdit = canPerform(userRole, 'responsableEdit', incident);
  const canWithdrawEdit = canPerform(userRole, 'withdrawEdit', incident, userId);
  const canRequestCancel = canPerform(userRole, 'requestCancel', incident, userId);
  const canWithdrawCancel = canPerform(userRole, 'withdrawCancel', incident, userId);
  const canCancel = canPerform(userRole, 'cancel', incident);
  const canTake = canPerform(userRole, 'take', incident, userId);
  const canSetPending = canPerform(userRole, 'setPending', incident);
  const canResume = canPerform(userRole, 'resume', incident);
  const canClose = canPerform(userRole, 'close', incident);
  const canSetPriority = canPerform(userRole, 'setPriority', incident);
  const canEditResponsibleComment = canPerform(userRole, 'responsibleComment', incident);
  const canInvalidateClosed = canPerform(userRole, 'invalidateClosed', incident);

  const canReviewEditRequest =
    isResponsable &&
    incident.edit_request != null &&
    (canPerform(userRole, 'approveEdit', incident) || canPerform(userRole, 'rejectEdit', incident));
  const canReviewCancelRequest =
    isResponsable &&
    incident.cancel_request === true &&
    (canPerform(userRole, 'approveCancel', incident) ||
      canPerform(userRole, 'rejectCancel', incident));

  const isResolved = isIncidentResolved(incident);
  const hasWorkflowActions = canTake || canSetPending || canResume || canClose || canSetPriority;
  const hasStandardActions =
    canRequestEdit || canDirectEdit || canResponsableEdit || canWithdrawEdit;
  const hasDangerActions =
    canRequestCancel || canWithdrawCancel || canCancel || canInvalidateClosed;
  const hasResponsibleInstruction =
    Boolean(incident.responsible_comment) || canEditResponsibleComment;

  return {
    canRequestEdit,
    canDirectEdit,
    canResponsableEdit,
    canWithdrawEdit,
    canRequestCancel,
    canWithdrawCancel,
    canCancel,
    canTake,
    canSetPending,
    canResume,
    canClose,
    canSetPriority,
    canEditResponsibleComment,
    canInvalidateClosed,
    canReviewEditRequest,
    canReviewCancelRequest,
    isResolved,
    hasWorkflowActions,
    hasStandardActions,
    hasDangerActions,
    hasResponsibleInstruction,
  };
}
