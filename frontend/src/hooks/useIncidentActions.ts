import { useRef } from 'react';
import {
  cancelWorkshopIncident,
  followWorkshopIncident,
  unfollowWorkshopIncident,
  updateWorkshopIncident,
} from '../api/workshop';
import { apiErrorMessage } from '../api/client';
import { translateApiError } from '../api/errorMessages';
import { useMutationFeedback } from '../components/ui/MutationFeedback';
import { WorkshopIncident } from '../types';
import { sortIncidents } from '../utils/incidentSort';
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
  const reviewActionRef = useRef(false);
  // Verrou anti-double-soumission pour les mutations « simples » (hors review,
  // qui a déjà reviewActionRef). Aucune de ces mutations ne peut partir deux fois.
  const simpleActionRef = useRef(false);
  const feedback = useMutationFeedback();

  // Exécute une mutation « simple » de bout en bout : verrou anti-double,
  // fermeture de la modale et succès métier annoncés seulement en cas de succès ;
  // en cas d'échec, la modale reste ouverte et une erreur globale persistante est
  // affichée (récupération possible). Le message d'erreur passe par le fallback
  // métier — le lot 2 introduira la traduction fine code+details.
  async function runSimple(
    op: () => Promise<void>,
    opts2: { successMessage: string; errorFallback: string; closeOnSuccess?: boolean }
  ): Promise<void> {
    if (simpleActionRef.current) return;
    simpleActionRef.current = true;
    try {
      await op();
      if (opts2.closeOnSuccess !== false) modal.closeModal();
      feedback.notifySuccess(opts2.successMessage);
    } catch (error) {
      feedback.notifyError(apiErrorMessage(error, opts2.errorFallback));
    } finally {
      simpleActionRef.current = false;
    }
  }

  async function patchIncident(id: number, payload: Parameters<typeof updateWorkshopIncident>[1]) {
    const updated = await updateWorkshopIncident(id, payload);
    setIncidents((prev) =>
      sortIncidents(prev.map((item) => (item.id === updated.id ? updated : item)))
    );
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
    await runSimple(
      async () => {
        await patchIncident(selectedIncident.id, { isTaken: true });
      },
      {
        successMessage: SUCCESS.TAKE_CHARGE,
        errorFallback: 'Impossible d’enregistrer la prise en charge.',
      }
    );
  }

  async function handleRequestDelete(reason: string) {
    if (!selectedIncident) return;
    await runSimple(
      async () => {
        const updated = await updateWorkshopIncident(selectedIncident.id, {
          cancelRequest: true,
          cancelRequestReason: reason,
        });
        upsertIncident(updated);
      },
      {
        successMessage: SUCCESS.REQUEST_DELETE,
        errorFallback: 'Impossible d’envoyer la demande d’annulation.',
      }
    );
  }

  async function handleApplyEditRequest() {
    if (!modal.state.reviewIncident || reviewActionRef.current) return;
    if (isMaintenance && modal.state.reviewIncident.is_taken) {
      modal.setReviewError('Modification interdite apres prise en charge.');
      return;
    }
    reviewActionRef.current = true;
    modal.setReviewLoading(true);
    modal.setReviewError('');
    try {
      const updated = await updateWorkshopIncident(modal.state.reviewIncident.id, {
        applyEditRequest: true,
      });
      upsertIncident(updated);
      void refreshMetrics();
      modal.closeReview();
      feedback.notifySuccess(SUCCESS.APPLY_EDIT);
    } catch (requestError) {
      modal.setReviewError(
        apiErrorMessage(requestError, "Impossible d'appliquer la modification.")
      );
    } finally {
      reviewActionRef.current = false;
      modal.setReviewLoading(false);
    }
  }

  async function handleRejectEditRequest(decisionReason: string) {
    if (!modal.state.reviewIncident || reviewActionRef.current) return;
    if (isMaintenance && modal.state.reviewIncident.is_taken) {
      modal.setReviewError('Modification interdite apres prise en charge.');
      return;
    }
    reviewActionRef.current = true;
    modal.setReviewLoading(true);
    modal.setReviewError('');
    try {
      const updated = await updateWorkshopIncident(modal.state.reviewIncident.id, {
        rejectEditRequest: true,
        decisionReason,
      });
      upsertIncident(updated);
      void refreshMetrics();
      modal.closeReview();
      feedback.notifySuccess(SUCCESS.REJECT_EDIT);
    } catch (requestError) {
      // Erreur TRADUITE (jamais le message brut ; le motif invalide renvoie un
      // details.field=decisionReason). La modale reste ouverte : la saisie du
      // motif est conservée.
      modal.setReviewError(translateApiError(requestError));
    } finally {
      reviewActionRef.current = false;
      modal.setReviewLoading(false);
    }
  }

  async function handleApproveDeleteRequest() {
    if (!modal.state.reviewIncident || reviewActionRef.current) return;
    reviewActionRef.current = true;
    modal.setReviewLoading(true);
    modal.setReviewError('');
    try {
      // Approbation d'une demande précise : expectArbitration=true.
      await applyCancelation(modal.state.reviewIncident.id, true);
      modal.closeReview();
      feedback.notifySuccess(SUCCESS.APPROVE_DELETE);
    } catch (_err) {
      modal.setReviewError(translateApiError(_err));
    } finally {
      reviewActionRef.current = false;
      modal.setReviewLoading(false);
    }
  }

  async function handleRejectDeleteRequest(decisionReason: string) {
    if (!modal.state.reviewIncident || reviewActionRef.current) return;
    reviewActionRef.current = true;
    modal.setReviewLoading(true);
    modal.setReviewError('');
    try {
      const updated = await updateWorkshopIncident(modal.state.reviewIncident.id, {
        rejectDeleteRequest: true,
        decisionReason,
      });
      upsertIncident(updated);
      void refreshMetrics();
      modal.closeReview();
      feedback.notifySuccess(SUCCESS.REJECT_DELETE);
    } catch (requestError) {
      // Erreur traduite (details.field=decisionReason) ; modale ouverte, saisie
      // du motif conservée.
      modal.setReviewError(translateApiError(requestError));
    } finally {
      reviewActionRef.current = false;
      modal.setReviewLoading(false);
    }
  }

  // Retrait de sa propre demande d'annulation par le demandeur (tant qu'elle est
  // en attente). Mutation simple : succès/erreur globaux + verrou anti-double.
  async function handleWithdrawCancelRequest(incident: WorkshopIncident) {
    await runSimple(
      async () => {
        const updated = await updateWorkshopIncident(incident.id, {
          withdrawCancelRequest: true,
        });
        upsertIncident(updated);
        void refreshMetrics();
      },
      {
        successMessage: SUCCESS.WITHDRAW_CANCEL,
        errorFallback: "Impossible de retirer la demande d'annulation.",
        closeOnSuccess: false,
      }
    );
  }

  async function handleSetPending(reason: string) {
    if (!selectedIncident) return;
    await runSimple(
      async () => {
        await patchIncident(selectedIncident.id, {
          status: 'PENDING',
          waitingReason: reason.trim(),
        });
      },
      {
        successMessage: SUCCESS.SET_PENDING,
        errorFallback: 'Impossible de mettre l’incident en attente.',
      }
    );
  }

  async function handleResumeIncident() {
    if (!selectedIncident) return;
    await runSimple(
      async () => {
        await patchIncident(selectedIncident.id, { status: 'OPEN' });
      },
      { successMessage: SUCCESS.RESUME, errorFallback: 'Impossible de reprendre le traitement.' }
    );
  }

  async function handleCloseIncident(note: string) {
    if (!selectedIncident) return;
    await runSimple(
      async () => {
        await patchIncident(selectedIncident.id, {
          status: 'CLOSED',
          interventionNote: note.trim(),
        });
      },
      { successMessage: SUCCESS.CLOSE, errorFallback: 'Impossible de clôturer l’incident.' }
    );
  }

  async function handleInvalidateIncident(reason: string) {
    if (!selectedIncident) return;
    await runSimple(
      async () => {
        await patchIncident(selectedIncident.id, {
          status: 'INVALIDATED',
          invalidationReason: reason.trim(),
        });
      },
      { successMessage: SUCCESS.INVALIDATE, errorFallback: 'Impossible d’invalider l’incident.' }
    );
  }

  async function handleToggleUrgent(incident: WorkshopIncident) {
    await runSimple(
      async () => {
        const updated = await updateWorkshopIncident(incident.id, {
          isPriority: !incident.is_priority,
        });
        upsertIncident(updated);
      },
      {
        successMessage: incident.is_priority ? SUCCESS.URGENT_OFF : SUCCESS.URGENT_ON,
        errorFallback: 'Impossible de modifier l’urgence.',
        closeOnSuccess: false,
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
    await runSimple(
      async () => {
        const updated = incident.is_followed
          ? await unfollowWorkshopIncident(incident.id)
          : await followWorkshopIncident(incident.id);
        upsertIncident(updated);
        modal.setUnfollowConfirm(null);
        void refreshMetrics();
      },
      {
        successMessage: incident.is_followed ? SUCCESS.FOLLOW_OFF : SUCCESS.FOLLOW_ON,
        errorFallback: 'Impossible de modifier le suivi.',
        closeOnSuccess: false,
      }
    );
  }

  async function handleMaintenanceDeleteConfirm(mode: 'direct' | 'approve') {
    if (reviewActionRef.current) return;
    reviewActionRef.current = true;
    modal.setReviewLoading(true);
    modal.setReviewError('');
    try {
      if (mode === 'approve' && modal.state.reviewIncident) {
        // Approbation d'une demande précise.
        await applyCancelation(modal.state.reviewIncident.id, true);
        modal.closeReview();
        feedback.notifySuccess(SUCCESS.APPROVE_DELETE);
        return;
      }
      if (mode === 'direct' && selectedIncident) {
        await applyCancelation(selectedIncident.id, false);
        modal.closeModal();
        feedback.notifySuccess(SUCCESS.APPROVE_DELETE);
      }
    } catch (err) {
      modal.setReviewError(translateApiError(err));
    } finally {
      reviewActionRef.current = false;
      modal.setReviewLoading(false);
    }
  }

  return {
    patchIncident,
    handleConfirmTakeCharge,
    handleRequestDelete,
    handleApplyEditRequest,
    handleRejectEditRequest,
    handleApproveDeleteRequest,
    handleRejectDeleteRequest,
    handleWithdrawCancelRequest,
    handleSetPending,
    handleResumeIncident,
    handleCloseIncident,
    handleInvalidateIncident,
    handleToggleUrgent,
    handleToggleFollow,
    handleMaintenanceDeleteConfirm,
  };
}
