import {
  deleteWorkshopIncident,
  followWorkshopIncident,
  reorderWorkshopIncidents,
  unfollowWorkshopIncident,
  updateWorkshopIncident,
} from '../api/workshop';
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
  filteredIncidents: WorkshopIncident[];
  draggedIncidentId: number | null;
  resetDragState: () => void;
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
    filteredIncidents,
    draggedIncidentId,
    resetDragState,
    isMaintenance,
  } = opts;

  async function patchIncident(id: number, payload: Parameters<typeof updateWorkshopIncident>[1]) {
    const updated = await updateWorkshopIncident(id, payload);
    setIncidents((prev) =>
      sortIncidents(prev.map((item) => (item.id === updated.id ? updated : item)))
    );
    void refreshMetrics();
    return updated;
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
    if (!modal.state.reviewIncident) return;
    if (isMaintenance && modal.state.reviewIncident.is_taken) {
      modal.setReviewError('Modification interdite apres prise en charge.');
      return;
    }
    modal.setReviewLoading(true);
    modal.setReviewError('');
    try {
      const updated = await updateWorkshopIncident(modal.state.reviewIncident.id, { applyEditRequest: true });
      upsertIncident(updated);
      modal.closeReview();
    } catch (_err) {
      modal.setReviewError("Impossible d'appliquer la modification.");
    } finally {
      modal.setReviewLoading(false);
    }
  }

  async function handleRejectEditRequest() {
    if (!modal.state.reviewIncident) return;
    if (isMaintenance && modal.state.reviewIncident.is_taken) {
      modal.setReviewError('Modification interdite apres prise en charge.');
      return;
    }
    modal.setReviewLoading(true);
    modal.setReviewError('');
    try {
      const updated = await updateWorkshopIncident(modal.state.reviewIncident.id, { rejectEditRequest: true });
      upsertIncident(updated);
      modal.closeReview();
    } catch (_err) {
      modal.setReviewError('Impossible de refuser la modification.');
    } finally {
      modal.setReviewLoading(false);
    }
  }

  async function handleApproveDeleteRequest() {
    if (!modal.state.reviewIncident) return;
    modal.setReviewLoading(true);
    modal.setReviewError('');
    try {
      await deleteWorkshopIncident(modal.state.reviewIncident.id);
      const id = modal.state.reviewIncident.id;
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
      modal.closeReview();
    } catch (_err) {
      modal.setReviewError("Impossible d'annuler l'incident.");
    } finally {
      modal.setReviewLoading(false);
    }
  }

  async function handleRejectDeleteRequest() {
    if (!modal.state.reviewIncident) return;
    modal.setReviewLoading(true);
    modal.setReviewError('');
    try {
      const updated = await updateWorkshopIncident(modal.state.reviewIncident.id, { rejectDeleteRequest: true });
      upsertIncident(updated);
      modal.closeReview();
    } catch (_err) {
      modal.setReviewError("Impossible de refuser l'annulation.");
    } finally {
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
    await patchIncident(selectedIncident.id, { status: 'INVALIDATED', invalidationReason: reason.trim() });
    modal.closeModal();
  }

  async function handleToggleUrgent(incident: WorkshopIncident) {
    const updated = await updateWorkshopIncident(incident.id, { isPriority: !incident.is_priority });
    upsertIncident(updated);
  }

  async function handleToggleFollow(incident: WorkshopIncident) {
    if (
      incident.is_followed &&
      (incident.status === 'CLOSED' || incident.status === 'CANCELED' || incident.status === 'INVALIDATED') &&
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
    if (mode === 'approve' && modal.state.reviewIncident) {
      const id = modal.state.reviewIncident.id;
      await deleteWorkshopIncident(id);
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
      modal.closeReview();
    }
    if (mode === 'direct' && selectedIncident) {
      const id = selectedIncident.id;
      await deleteWorkshopIncident(id);
      setIncidents((prev) =>
        sortIncidents(
          prev.map((item) =>
            item.id === id
              ? { ...item, status: 'CANCELED', cancel_request: false, cancel_request_reason: null }
              : item
          )
        )
      );
      clearSelectedIncident();
      void refreshMetrics();
    }
    modal.closeModal();
  }

  async function persistManualOrder(ordered: WorkshopIncident[]) {
    const baseOrder = ordered.length + 1;
    const reorderedIds = new Set(ordered.map((item) => item.id));
    const nextOrderById = new Map<number, number>();
    ordered.forEach((item, i) => nextOrderById.set(item.id, baseOrder - i));

    setIncidents((prev) =>
      sortIncidents(
        prev.map((item) =>
          reorderedIds.has(item.id)
            ? { ...item, display_order: nextOrderById.get(item.id) ?? item.display_order }
            : item
        )
      )
    );
    await reorderWorkshopIncidents(ordered.map((item) => item.id));
  }

  async function reorderDraggedIncident(targetId: number) {
    if (!draggedIncidentId || draggedIncidentId === targetId) return;
    const fromIndex = filteredIncidents.findIndex((item) => item.id === draggedIncidentId);
    const toIndex = filteredIncidents.findIndex((item) => item.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;
    const nextOrdered = [...filteredIncidents];
    const [moved] = nextOrdered.splice(fromIndex, 1);
    nextOrdered.splice(toIndex, 0, moved);
    await persistManualOrder(nextOrdered);
    resetDragState();
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
    reorderDraggedIncident,
  };
}
