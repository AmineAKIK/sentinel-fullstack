import {
  cancelWorkshopIncident,
  followWorkshopIncident,
  unfollowWorkshopIncident,
  updateWorkshopIncident,
} from '../api/workshop';
import { apiErrorMessage, translateApiError } from '../api/errorMessages';
import { useMutationRunner } from '../components/ui/MutationFeedback';
import { WorkshopIncident } from '../types';
import { sortIncidents } from '../utils/incidentSort';
import { WORKSHOP_MUTATION_KEYS } from '../utils/workshopMutationKeys';
import { ModalStateApi } from './useModalState';

// Messages de succès (résultat métier) du catalogue RC3. Le canal global ne
// porte que le résultat métier et les erreurs globales ; les erreurs de champ
// restent locales aux formulaires (modale d'arbitrage notamment).
const SUCCESS = {
  TAKE_CHARGE: 'Prise en charge enregistrée.',
  SET_PENDING: 'Incident mis en attente.',
  RESUME: 'Traitement repris.',
  CLOSE: 'Incident clôturé et conservé dans l’historique.',
  INVALIDATE: 'Incident invalidé et conservé dans l’historique.',
  REQUEST_DELETE: 'Demande d’annulation envoyée.',
  WITHDRAW_CANCEL: 'Demande d’annulation retirée.',
  APPLY_EDIT: 'Modification appliquée.',
  REJECT_EDIT: 'Demande de modification refusée.',
  APPROVE_DELETE: 'Incident annulé et conservé dans l’historique.',
  REJECT_DELETE: 'Demande d’annulation refusée.',
  REQUEST_EDIT: 'Demande de correction envoyée.',
  WITHDRAW_EDIT: 'Demande de correction retirée.',
  URGENT_ON: 'Incident déclaré urgent.',
  URGENT_OFF: 'Urgence retirée.',
  FOLLOW_ON: 'Suivi activé.',
  FOLLOW_OFF: 'Suivi désactivé.',
} as const;

interface IncidentActionsOptions {
  selectedIncident: WorkshopIncident | null;
  clearSelectedIncident: (replace?: boolean) => void;
  upsertIncident: (updated: WorkshopIncident) => void;
  setIncidents: React.Dispatch<React.SetStateAction<WorkshopIncident[]>>;
  refreshMetrics: () => Promise<void>;
  modal: ModalStateApi;
  isMaintenance: boolean;
  userRole: string | undefined;
}

export function useIncidentActions(opts: IncidentActionsOptions) {
  const {
    selectedIncident,
    clearSelectedIncident,
    upsertIncident,
    setIncidents,
    refreshMetrics,
    modal,
    isMaintenance,
  } = opts;
  const mutation = useMutationRunner();

  async function patchIncident(id: number, payload: Parameters<typeof updateWorkshopIncident>[1]) {
    const updated = await updateWorkshopIncident(id, payload);
    upsertIncident(updated);
    void refreshMetrics();
    return updated;
  }

  // Annule côté serveur puis applique le patch optimiste local (statut
  // CANCELED, reset de la demande d'annulation) — commun aux 3 chemins qui
  // mènent à une annulation confirmée (approbation, annulation directe RESPONSABLE/MAINTENANCE).
  // `expectArbitration` distingue l'approbation d'une demande (true) de
  // l'annulation directe (false) : côté serveur, une approbation dont la demande
  // a disparu échoue proprement au lieu d'annuler directement.
  async function applyCancelation(id: number, expectArbitration = false) {
    await cancelWorkshopIncident(id, { expectArbitration });
    setIncidents((prev) =>
      sortIncidents(
        prev.map((item) =>
          item.id === id
            ? { ...item, status: 'CANCELED', cancel_request: false, cancel_request_reason: null }
            : item
        )
      )
    );
    if (selectedIncident?.id === id) clearSelectedIncident();
    void refreshMetrics();
  }

  async function handleConfirmTakeCharge() {
    if (!selectedIncident) return;
    await mutation.execute(() => patchIncident(selectedIncident.id, { isTaken: true }), {
      key: WORKSHOP_MUTATION_KEYS.TAKE_CHARGE,
      successMessage: SUCCESS.TAKE_CHARGE,
      toErrorMessage: (error) =>
        apiErrorMessage(error, 'Impossible d’enregistrer la prise en charge.'),
      onSuccess: () => modal.closeModal(),
    });
  }

  async function handleRequestDelete(reason: string) {
    if (!selectedIncident) return;
    await mutation.execute(
      () =>
        updateWorkshopIncident(selectedIncident.id, {
          cancelRequest: true,
          cancelRequestReason: reason,
        }),
      {
        key: WORKSHOP_MUTATION_KEYS.REQUEST_CANCEL,
        successMessage: SUCCESS.REQUEST_DELETE,
        toErrorMessage: (error) =>
          apiErrorMessage(error, 'Impossible d’envoyer la demande d’annulation.'),
        onSuccess: (updated) => {
          upsertIncident(updated);
          modal.closeModal();
        },
      }
    );
  }

  async function handleApplyEditRequest() {
    if (!modal.state.reviewIncident) return;
    if (isMaintenance && modal.state.reviewIncident.is_taken) {
      modal.setReviewError('Modification interdite apres prise en charge.');
      return;
    }
    modal.setReviewError('');
    await mutation.execute(
      () =>
        updateWorkshopIncident(modal.state.reviewIncident!.id, {
          applyEditRequest: true,
        }),
      {
        key: WORKSHOP_MUTATION_KEYS.APPLY_EDIT,
        successMessage: SUCCESS.APPLY_EDIT,
        errorPresentation: 'local',
        toErrorMessage: (error) =>
          apiErrorMessage(error, "Impossible d'appliquer la modification."),
        onSuccess: (updated) => {
          upsertIncident(updated);
          void refreshMetrics();
          modal.closeReview();
        },
        onError: (_error, safeMessage) => modal.setReviewError(safeMessage),
      }
    );
  }

  async function handleRejectEditRequest(decisionReason: string) {
    if (!modal.state.reviewIncident) return;
    if (isMaintenance && modal.state.reviewIncident.is_taken) {
      modal.setReviewError('Modification interdite apres prise en charge.');
      return;
    }
    modal.setReviewError('');
    await mutation.execute(
      () =>
        updateWorkshopIncident(modal.state.reviewIncident!.id, {
          rejectEditRequest: true,
          decisionReason,
        }),
      {
        key: WORKSHOP_MUTATION_KEYS.REJECT_EDIT,
        successMessage: SUCCESS.REJECT_EDIT,
        errorPresentation: 'local',
        toErrorMessage: translateApiError,
        onSuccess: (updated) => {
          upsertIncident(updated);
          void refreshMetrics();
          modal.closeReview();
        },
        onError: (_error, safeMessage) => modal.setReviewError(safeMessage),
      }
    );
  }

  async function handleApproveDeleteRequest() {
    if (!modal.state.reviewIncident) return;
    modal.setReviewError('');
    await mutation.execute(() => applyCancelation(modal.state.reviewIncident!.id, true), {
      key: WORKSHOP_MUTATION_KEYS.APPROVE_CANCEL,
      successMessage: SUCCESS.APPROVE_DELETE,
      errorPresentation: 'local',
      toErrorMessage: translateApiError,
      onSuccess: () => modal.closeReview(),
      onError: (_error, safeMessage) => modal.setReviewError(safeMessage),
    });
  }

  async function handleRejectDeleteRequest(decisionReason: string) {
    if (!modal.state.reviewIncident) return;
    modal.setReviewError('');
    await mutation.execute(
      () =>
        updateWorkshopIncident(modal.state.reviewIncident!.id, {
          rejectDeleteRequest: true,
          decisionReason,
        }),
      {
        key: WORKSHOP_MUTATION_KEYS.REJECT_CANCEL,
        successMessage: SUCCESS.REJECT_DELETE,
        errorPresentation: 'local',
        toErrorMessage: translateApiError,
        onSuccess: (updated) => {
          upsertIncident(updated);
          void refreshMetrics();
          modal.closeReview();
        },
        onError: (_error, safeMessage) => modal.setReviewError(safeMessage),
      }
    );
  }

  async function handleSetPending(reason: string) {
    if (!selectedIncident) return;
    await mutation.execute(
      () =>
        patchIncident(selectedIncident.id, {
          status: 'PENDING',
          waitingReason: reason.trim(),
        }),
      {
        key: WORKSHOP_MUTATION_KEYS.SET_PENDING,
        successMessage: SUCCESS.SET_PENDING,
        toErrorMessage: (error) =>
          apiErrorMessage(error, 'Impossible de mettre l’incident en attente.'),
        onSuccess: () => modal.closeModal(),
      }
    );
  }

  async function handleResumeIncident() {
    if (!selectedIncident) return;
    await mutation.execute(() => patchIncident(selectedIncident.id, { status: 'OPEN' }), {
      key: WORKSHOP_MUTATION_KEYS.RESUME,
      successMessage: SUCCESS.RESUME,
      toErrorMessage: (error) => apiErrorMessage(error, 'Impossible de reprendre le traitement.'),
      onSuccess: () => modal.closeModal(),
    });
  }

  async function handleCloseIncident(note: string) {
    if (!selectedIncident) return;
    await mutation.execute(
      () =>
        patchIncident(selectedIncident.id, {
          status: 'CLOSED',
          interventionNote: note.trim(),
        }),
      {
        key: WORKSHOP_MUTATION_KEYS.CLOSE,
        successMessage: SUCCESS.CLOSE,
        toErrorMessage: (error) => apiErrorMessage(error, 'Impossible de clôturer l’incident.'),
        onSuccess: () => modal.closeModal(),
      }
    );
  }

  async function handleInvalidateIncident(reason: string) {
    if (!selectedIncident) return;
    await mutation.execute(
      () =>
        patchIncident(selectedIncident.id, {
          status: 'INVALIDATED',
          invalidationReason: reason.trim(),
        }),
      {
        key: WORKSHOP_MUTATION_KEYS.INVALIDATE,
        successMessage: SUCCESS.INVALIDATE,
        toErrorMessage: (error) => apiErrorMessage(error, 'Impossible d’invalider l’incident.'),
        onSuccess: () => modal.closeModal(),
      }
    );
  }

  async function handleToggleUrgent(incident: WorkshopIncident) {
    await mutation.execute(
      () =>
        updateWorkshopIncident(incident.id, {
          isPriority: !incident.is_priority,
        }),
      {
        key: WORKSHOP_MUTATION_KEYS.PRIORITY,
        successMessage: incident.is_priority ? SUCCESS.URGENT_OFF : SUCCESS.URGENT_ON,
        toErrorMessage: (error) => apiErrorMessage(error, 'Impossible de modifier l’urgence.'),
        onSuccess: upsertIncident,
      }
    );
  }

  async function handleToggleFollow(incident: WorkshopIncident) {
    if (
      incident.is_followed &&
      (incident.status === 'CLOSED' ||
        incident.status === 'CANCELED' ||
        incident.status === 'INVALIDATED') &&
      modal.state.unfollowConfirmIncident?.id !== incident.id
    ) {
      // Ouverture de la confirmation de retrait de suivi : pas encore une mutation.
      modal.setUnfollowConfirm(incident);
      return;
    }
    await mutation.execute(
      () =>
        incident.is_followed
          ? unfollowWorkshopIncident(incident.id)
          : followWorkshopIncident(incident.id),
      {
        key: WORKSHOP_MUTATION_KEYS.FOLLOW,
        successMessage: incident.is_followed ? SUCCESS.FOLLOW_OFF : SUCCESS.FOLLOW_ON,
        toErrorMessage: (error) => apiErrorMessage(error, 'Impossible de modifier le suivi.'),
        onSuccess: (updated) => {
          upsertIncident(updated);
          modal.setUnfollowConfirm(null);
          void refreshMetrics();
        },
      }
    );
  }

  async function handleMaintenanceDeleteConfirm() {
    if (!selectedIncident) return;
    await mutation.execute(() => applyCancelation(selectedIncident.id, false), {
      key: WORKSHOP_MUTATION_KEYS.DIRECT_CANCEL,
      successMessage: SUCCESS.APPROVE_DELETE,
      toErrorMessage: translateApiError,
      onSuccess: () => modal.closeModal(),
    });
  }

  return {
    patchIncident,
    handleConfirmTakeCharge,
    handleRequestDelete,
    handleApplyEditRequest,
    handleRejectEditRequest,
    handleApproveDeleteRequest,
    handleRejectDeleteRequest,
    handleSetPending,
    handleResumeIncident,
    handleCloseIncident,
    handleInvalidateIncident,
    handleToggleUrgent,
    handleToggleFollow,
    handleMaintenanceDeleteConfirm,
  };
}
