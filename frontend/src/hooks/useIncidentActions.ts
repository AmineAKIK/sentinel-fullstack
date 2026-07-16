import { useRef } from 'react';
import {
  cancelWorkshopIncident,
  followWorkshopIncident,
  unfollowWorkshopIncident,
  updateWorkshopIncident,
} from '../api/workshop';
import { apiErrorMessage } from '../api/client';
import { WorkshopIncident } from '../types';
import { sortIncidents } from '../utils/incidentSort';
import { ModalStateApi } from './useModalState';

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
  async function applyCancelation(id: number) {
    await cancelWorkshopIncident(id);
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
    await patchIncident(selectedIncident.id, { isTaken: true });
    modal.closeModal();
  }

  async function handleRequestDelete(reason: string) {
    if (!selectedIncident) return;
    const updated = await updateWorkshopIncident(selectedIncident.id, {
      cancelRequest: true,
      cancelRequestReason: reason,
    });
    upsertIncident(updated);
    modal.closeModal();
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
    } catch (requestError) {
      modal.setReviewError(
        apiErrorMessage(requestError, "Impossible d'appliquer la modification.")
      );
    } finally {
      reviewActionRef.current = false;
      modal.setReviewLoading(false);
    }
  }

  async function handleRejectEditRequest() {
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
      });
      upsertIncident(updated);
      void refreshMetrics();
      modal.closeReview();
    } catch (requestError) {
      modal.setReviewError(apiErrorMessage(requestError, 'Impossible de refuser la modification.'));
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
      await applyCancelation(modal.state.reviewIncident.id);
      modal.closeReview();
    } catch (_err) {
      modal.setReviewError(apiErrorMessage(_err, "Impossible d'annuler l'incident."));
    } finally {
      reviewActionRef.current = false;
      modal.setReviewLoading(false);
    }
  }

  async function handleRejectDeleteRequest() {
    if (!modal.state.reviewIncident || reviewActionRef.current) return;
    reviewActionRef.current = true;
    modal.setReviewLoading(true);
    modal.setReviewError('');
    try {
      const updated = await updateWorkshopIncident(modal.state.reviewIncident.id, {
        rejectDeleteRequest: true,
      });
      upsertIncident(updated);
      void refreshMetrics();
      modal.closeReview();
    } catch (requestError) {
      modal.setReviewError(apiErrorMessage(requestError, "Impossible de refuser l'annulation."));
    } finally {
      reviewActionRef.current = false;
      modal.setReviewLoading(false);
    }
  }

  async function handleSetPending(reason: string) {
    if (!selectedIncident) return;
    await patchIncident(selectedIncident.id, { status: 'PENDING', diagnostic: reason.trim() });
    modal.closeModal();
  }

  async function handleResumeIncident() {
    if (!selectedIncident) return;
    await patchIncident(selectedIncident.id, { status: 'OPEN' });
    modal.closeModal();
  }

  async function handleCloseIncident(note: string) {
    if (!selectedIncident) return;
    await patchIncident(selectedIncident.id, { status: 'CLOSED', interventionNote: note.trim() });
    modal.closeModal();
  }

  async function handleInvalidateIncident(reason: string) {
    if (!selectedIncident) return;
    await patchIncident(selectedIncident.id, {
      status: 'INVALIDATED',
      invalidationReason: reason.trim(),
    });
    modal.closeModal();
  }

  async function handleToggleUrgent(incident: WorkshopIncident) {
    const updated = await updateWorkshopIncident(incident.id, {
      isPriority: !incident.is_priority,
    });
    upsertIncident(updated);
  }

  async function handleToggleFollow(incident: WorkshopIncident) {
    if (
      incident.is_followed &&
      (incident.status === 'CLOSED' ||
        incident.status === 'CANCELED' ||
        incident.status === 'INVALIDATED') &&
      modal.state.unfollowConfirmIncident?.id !== incident.id
    ) {
      modal.setUnfollowConfirm(incident);
      return;
    }
    const updated = incident.is_followed
      ? await unfollowWorkshopIncident(incident.id)
      : await followWorkshopIncident(incident.id);
    upsertIncident(updated);
    modal.setUnfollowConfirm(null);
    void refreshMetrics();
  }

  async function handleMaintenanceDeleteConfirm(mode: 'direct' | 'approve') {
    if (reviewActionRef.current) return;
    reviewActionRef.current = true;
    modal.setReviewLoading(true);
    modal.setReviewError('');
    try {
      if (mode === 'approve' && modal.state.reviewIncident) {
        await applyCancelation(modal.state.reviewIncident.id);
        modal.closeReview();
        return;
      }
      if (mode === 'direct' && selectedIncident) {
        await applyCancelation(selectedIncident.id);
        modal.closeModal();
      }
    } catch (err) {
      modal.setReviewError(apiErrorMessage(err, "Impossible d'annuler l'incident."));
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
    handleSetPending,
    handleResumeIncident,
    handleCloseIncident,
    handleInvalidateIncident,
    handleToggleUrgent,
    handleToggleFollow,
    handleMaintenanceDeleteConfirm,
  };
}
