import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import CreateIncidentModal from '../components/CreateIncidentModal';
import IncidentMetricsBar from '../components/IncidentMetricsBar';
import DashboardFilters from '../components/DashboardFilters';
import IncidentCard from '../components/IncidentCard';
import DeleteRequestModal from '../components/DeleteRequestModal';
import MaintenanceDeleteConfirmModal from '../components/MaintenanceDeleteConfirmModal';
import ReviewIncidentRequestModal from '../components/ReviewIncidentRequestModal';
import TakeChargeConfirmModal from '../components/TakeChargeConfirmModal';
import PendingConfirmModal from '../components/PendingConfirmModal';
import ResumeIncidentConfirmModal from '../components/ResumeIncidentConfirmModal';
import CloseIncidentModal from '../components/CloseIncidentModal';
import UnfollowIncidentConfirmModal from '../components/UnfollowIncidentConfirmModal';
import DeleteResponsibleCommentConfirmModal from '../components/DeleteResponsibleCommentConfirmModal';
import WorkshopNavBar from '../components/WorkshopNavBar';
import InvalidateIncidentModal from '../components/InvalidateIncidentModal';
import FilterSummary, { FilterChip } from '../components/FilterSummary';
import DetailField from '../components/ui/DetailField';
import ErrorBanner from '../components/ui/ErrorBanner';
import {
  deleteWorkshopIncident,
  followWorkshopIncident,
  getIncidentMetrics,
  listWorkshopIncidents,
  listWorkshopLines,
  reorderWorkshopIncidents,
  unfollowWorkshopIncident,
  updateWorkshopIncident,
} from '../api/workshop';
import { useWorkshopAuth } from '../routes/WorkshopAuthContext';
import { ProductionLine, WorkshopIncident, WorkshopIncidentMetrics } from '../types';
import { formatDateTime } from '../utils/date';
import { ROLE_LABELS, SHIFT_LABELS, STATE_LABELS, STATUS_LABELS } from '../utils/labels';
import { canPerform } from '../utils/workshopPermissions';

function isWithinLastDays(iso: string, days: number): boolean {
  const createdAt = new Date(iso).getTime();
  const limit = Date.now() - days * 24 * 60 * 60 * 1000;
  return createdAt >= limit;
}

export default function WorkshopDashboardPage() {
  const { user } = useWorkshopAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [incidents, setIncidents] = useState<WorkshopIncident[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDeleteRequest, setShowDeleteRequest] = useState(false);
  const [showTakeChargeConfirm, setShowTakeChargeConfirm] = useState(false);
  const [showPendingConfirm, setShowPendingConfirm] = useState(false);
  const [showResumeConfirm, setShowResumeConfirm] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showInvalidateConfirm, setShowInvalidateConfirm] = useState(false);
  const [showMaintenanceDeleteConfirm, setShowMaintenanceDeleteConfirm] = useState(false);
  const [unfollowConfirmIncident, setUnfollowConfirmIncident] = useState<WorkshopIncident | null>(null);
  const [deleteResponsibleCommentIncident, setDeleteResponsibleCommentIncident] = useState<WorkshopIncident | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [draggedIncidentId, setDraggedIncidentId] = useState<number | null>(null);
  const [dragOverIncidentId, setDragOverIncidentId] = useState<number | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const scrollSpeedRef = useRef(0);
  const [maintenanceDeleteMode, setMaintenanceDeleteMode] = useState<'direct' | 'approve' | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<WorkshopIncident | null>(null);
  const [reviewIncident, setReviewIncident] = useState<WorkshopIncident | null>(null);
  const [reviewType, setReviewType] = useState<'edit' | 'delete' | null>(null);
  const [reviewError, setReviewError] = useState('');
  const [reviewLoading, setReviewLoading] = useState(false);
  const [responsibleDrafts, setResponsibleDrafts] = useState<Record<number, string>>({});
  const [metrics, setMetrics] = useState<WorkshopIncidentMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [filters, setFilters] = useState({
    lineId: 'all',
    status: 'all',
    priority: 'all',
    taken: 'all',
    scope: 'all',
    query: '',
    aging: 'all',
  });
  const [sortOrder, setSortOrder] = useState<'default' | 'date_desc' | 'date_asc'>('default');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const canAct = Boolean(user);
  const isOperator = user?.role === 'OPERATOR';
  const isMaintenance = user?.role === 'MAINTENANCE';
  const isResponsable = user?.role === 'RESPONSABLE';
  const selectedIncidentParam = searchParams.get('incident');

  const secondaryFilterCount = [
    filters.lineId !== 'all',
    filters.priority !== 'all',
    filters.taken !== 'all',
  ].filter(Boolean).length;
  const hasQuickFilter = filters.status !== 'all' || filters.aging !== 'all';
  const hasScopeFilter = filters.scope !== 'all';
  const hasSearchFilter = filters.query.trim().length > 0;
  const activeFilterCount = secondaryFilterCount + (hasQuickFilter ? 1 : 0) + (hasScopeFilter ? 1 : 0) + (hasSearchFilter ? 1 : 0);

  function clearAllFilters() {
    setFilters({
      lineId: 'all',
      status: 'all',
      priority: 'all',
      taken: 'all',
      scope: 'all',
      query: '',
      aging: 'all',
    });
  }

  function setIncidentUrlParam(id: number | null, replace = false) {
    const nextParams = new URLSearchParams(searchParams);
    if (id === null) {
      nextParams.delete('incident');
    } else {
      nextParams.set('incident', String(id));
    }
    setSearchParams(nextParams, { replace });
  }

  function clearSelectedIncident(replace = true) {
    setSelectedIncident(null);
    setIncidentUrlParam(null, replace);
  }

  function selectedLineLabel(): string {
    return lines.find((line) => String(line.id) === filters.lineId)?.line_number || filters.lineId;
  }

  const filterChips: FilterChip[] = [
    ...(hasSearchFilter ? [{
      key: 'search',
      label: `Recherche: ${filters.query.trim()}`,
      onRemove: () => setFilters((prev) => ({ ...prev, query: '' })),
    }] : []),
    ...(filters.status === 'OPEN' ? [{
      key: 'status-open',
      label: 'Ouverts',
      onRemove: () => setFilters((prev) => ({ ...prev, status: 'all' })),
    }] : []),
    ...(filters.status === 'PENDING' ? [{
      key: 'status-pending',
      label: 'En attente',
      onRemove: () => setFilters((prev) => ({ ...prev, status: 'all' })),
    }] : []),
    ...(filters.status === 'CLOSED' ? [{
      key: 'status-closed',
      label: 'Clôturés 7j',
      onRemove: () => setFilters((prev) => ({ ...prev, status: 'all' })),
    }] : []),
    ...(filters.aging === 'over_7d' ? [{
      key: 'aging',
      label: 'Ouverts > 7j',
      onRemove: () => setFilters((prev) => ({ ...prev, aging: 'all' })),
    }] : []),
    ...(filters.lineId !== 'all' ? [{
      key: 'line',
      label: `Ligne ${selectedLineLabel()}`,
      onRemove: () => setFilters((prev) => ({ ...prev, lineId: 'all' })),
    }] : []),
    ...(filters.priority !== 'all' ? [{
      key: 'priority',
      label: filters.priority === 'urgent' ? 'Urgents' : 'Non urgents',
      onRemove: () => setFilters((prev) => ({ ...prev, priority: 'all' })),
    }] : []),
    ...(filters.taken !== 'all' ? [{
      key: 'taken',
      label: filters.taken === 'taken' ? 'Pris en charge' : 'Non pris',
      onRemove: () => setFilters((prev) => ({ ...prev, taken: 'all' })),
    }] : []),
    ...(filters.scope === 'followed' ? [{
      key: 'followed',
      label: 'Suivis',
      onRemove: () => setFilters((prev) => ({ ...prev, scope: 'all' })),
    }] : []),
    ...(filters.scope === 'assigned_to_me' ? [{
      key: 'assigned_to_me',
      label: 'Pris par moi',
      onRemove: () => setFilters((prev) => ({ ...prev, scope: 'all' })),
    }] : []),
    ...(filters.scope === 'created_by_me' ? [{
      key: 'created_by_me',
      label: 'Créés par moi',
      onRemove: () => setFilters((prev) => ({ ...prev, scope: 'all' })),
    }] : []),
  ];

  function stopAutoScroll() {
    scrollSpeedRef.current = 0;
    if (scrollFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollFrameRef.current);
      scrollFrameRef.current = null;
    }
  }

  function scheduleAutoScroll(clientY: number) {
    const edgeSize = 120;
    const maxStep = 16;
    const viewportHeight = window.innerHeight;
    let nextSpeed = 0;

    if (clientY < edgeSize) {
      const intensity = (edgeSize - clientY) / edgeSize;
      nextSpeed = -Math.ceil(maxStep * intensity);
    } else if (clientY > viewportHeight - edgeSize) {
      const intensity = (clientY - (viewportHeight - edgeSize)) / edgeSize;
      nextSpeed = Math.ceil(maxStep * intensity);
    }

    scrollSpeedRef.current = nextSpeed;
    if (nextSpeed === 0) {
      stopAutoScroll();
      return;
    }

    if (scrollFrameRef.current !== null) return;
    const tick = () => {
      if (scrollSpeedRef.current === 0) {
        scrollFrameRef.current = null;
        return;
      }
      window.scrollBy(0, scrollSpeedRef.current);
      scrollFrameRef.current = window.requestAnimationFrame(tick);
    };
    scrollFrameRef.current = window.requestAnimationFrame(tick);
  }

  useEffect(() => {
    return () => {
      stopAutoScroll();
    };
  }, []);

  function resetDragState() {
    setDraggedIncidentId(null);
    setDragOverIncidentId(null);
    stopAutoScroll();
  }

  function setDropTarget(id: number) {
    if (dragOverIncidentId !== id) {
      setDragOverIncidentId(id);
    }
  }

  function sortIncidents(items: WorkshopIncident[]): WorkshopIncident[] {
    return [...items].sort((a, b) => {
      if (a.is_priority !== b.is_priority) {
        return a.is_priority ? -1 : 1;
      }
      if (a.display_order !== b.display_order) {
        return b.display_order - a.display_order;
      }
      if (a.is_taken !== b.is_taken) {
        return a.is_taken ? 1 : -1;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }

  async function persistManualOrder(ordered: WorkshopIncident[]) {
    const baseOrder = ordered.length + 1;
    const reorderedIds = new Set(ordered.map((item) => item.id));
    const nextOrderById = new Map<number, number>();
    ordered.forEach((item, orderIndex) => {
      nextOrderById.set(item.id, baseOrder - orderIndex);
    });

    setIncidents((prev) =>
      sortIncidents(prev.map((item) => (
        reorderedIds.has(item.id)
          ? { ...item, display_order: nextOrderById.get(item.id) ?? item.display_order }
          : item
      )))
    );

    await reorderWorkshopIncidents(ordered.map((item) => item.id));
  }

  async function reorderDraggedIncident(targetId: number) {
    if (!draggedIncidentId || draggedIncidentId === targetId) return;
    const ordered = filteredIncidents;
    const fromIndex = ordered.findIndex((item) => item.id === draggedIncidentId);
    const toIndex = ordered.findIndex((item) => item.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;

    const nextOrdered = [...ordered];
    const [moved] = nextOrdered.splice(fromIndex, 1);
    nextOrdered.splice(toIndex, 0, moved);
    await persistManualOrder(nextOrdered);
    resetDragState();
  }

  useEffect(() => {
    setLoading(true);
    Promise.all([listWorkshopLines(), listWorkshopIncidents()])
      .then(([lineData, incidentData]) => {
        setLines(lineData);
        setIncidents(sortIncidents(incidentData));
      })
      .catch(() => setError('Impossible de charger le tableau de bord.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedIncidentParam) {
      setSelectedIncident(null);
      return;
    }
    const requestedIncident = incidents.find((incident) => String(incident.id) === selectedIncidentParam);
    if (requestedIncident) {
      setSelectedIncident(requestedIncident);
      return;
    }
    if (!loading && incidents.length > 0) {
      setIncidentUrlParam(null, true);
    }
  }, [selectedIncidentParam, incidents, loading]);

  async function refreshMetrics() {
    setMetricsLoading(true);
    try {
      const nextMetrics = await getIncidentMetrics();
      setMetrics(nextMetrics);
    } catch {
      setMetrics(null);
    } finally {
      setMetricsLoading(false);
    }
  }

  useEffect(() => {
    void refreshMetrics();
  }, []);

  async function patchIncident(id: number, payload: Parameters<typeof updateWorkshopIncident>[1]) {
    const updated = await updateWorkshopIncident(id, payload);
    setIncidents((prev) =>
      sortIncidents(prev.map((item) => (item.id === updated.id ? updated : item)))
    );
    setSelectedIncident(updated);
    void refreshMetrics();
  }

  function upsertIncident(updated: WorkshopIncident) {
    setIncidents((prev) =>
      sortIncidents(prev.map((item) => (item.id === updated.id ? updated : item)))
    );
    setSelectedIncident((prev) => (prev?.id === updated.id ? updated : prev));
  }

  function openReview(incident: WorkshopIncident, type: 'edit' | 'delete') {
    setReviewIncident(incident);
    setReviewType(type);
    setReviewError('');
  }

  function closeReview() {
    setReviewIncident(null);
    setReviewType(null);
    setReviewError('');
    setReviewLoading(false);
  }

  function openMaintenanceDeleteConfirm(mode: 'direct' | 'approve') {
    setMaintenanceDeleteMode(mode);
    setShowMaintenanceDeleteConfirm(true);
  }

  async function handleConfirmTakeCharge() {
    if (!selectedIncident) return;
    await patchIncident(selectedIncident.id, { isTaken: true });
    setShowTakeChargeConfirm(false);
  }

  async function handleRequestDelete(reason: string) {
    if (!selectedIncident) return;
    const updated = await updateWorkshopIncident(selectedIncident.id, {
      cancelRequest: true,
      cancelRequestReason: reason,
    });
    upsertIncident(updated);
    setShowDeleteRequest(false);
  }

  async function handleApplyEditRequest() {
    if (!reviewIncident) return;
    if (isMaintenance && reviewIncident.is_taken) {
      setReviewError('Modification interdite apres prise en charge.');
      return;
    }
    setReviewLoading(true);
    setReviewError('');
    try {
      const updated = await updateWorkshopIncident(reviewIncident.id, { applyEditRequest: true });
      upsertIncident(updated);
      closeReview();
    } catch (err) {
      setReviewError('Impossible d\'appliquer la modification.');
    } finally {
      setReviewLoading(false);
    }
  }

  async function handleRejectEditRequest() {
    if (!reviewIncident) return;
    if (isMaintenance && reviewIncident.is_taken) {
      setReviewError('Modification interdite apres prise en charge.');
      return;
    }
    setReviewLoading(true);
    setReviewError('');
    try {
      const updated = await updateWorkshopIncident(reviewIncident.id, { rejectEditRequest: true });
      upsertIncident(updated);
      closeReview();
    } catch (err) {
      setReviewError('Impossible de refuser la modification.');
    } finally {
      setReviewLoading(false);
    }
  }

  async function handleApproveDeleteRequest() {
    if (!reviewIncident) return;
    setReviewLoading(true);
    setReviewError('');
    try {
      await deleteWorkshopIncident(reviewIncident.id);
      setIncidents((prev) => sortIncidents(prev.map((item) => (
        item.id === reviewIncident.id ? { ...item, status: 'CANCELED', cancel_request: false, cancel_request_reason: null } : item
      ))));
      if (selectedIncident?.id === reviewIncident.id) clearSelectedIncident();
      void refreshMetrics();
      closeReview();
    } catch (err) {
      setReviewError("Impossible d’annuler l'incident.");
    } finally {
      setReviewLoading(false);
    }
  }

  async function handleRejectDeleteRequest() {
    if (!reviewIncident) return;
    setReviewLoading(true);
    setReviewError('');
    try {
      const updated = await updateWorkshopIncident(reviewIncident.id, { rejectDeleteRequest: true });
      upsertIncident(updated);
      closeReview();
    } catch (err) {
      setReviewError("Impossible de refuser l’annulation.");
    } finally {
      setReviewLoading(false);
    }
  }

  async function handleSetPending(reason: string) {
    if (!selectedIncident) return;
    await patchIncident(selectedIncident.id, { status: 'PENDING', diagnostic: reason.trim() });
    setShowPendingConfirm(false);
  }

  async function handleResumeIncident() {
    if (!selectedIncident) return;
    await patchIncident(selectedIncident.id, { status: 'OPEN' });
    setShowResumeConfirm(false);
  }

  async function handleCloseIncident(note: string) {
    if (!selectedIncident) return;
    await patchIncident(selectedIncident.id, { status: 'CLOSED', interventionNote: note.trim() });
    setShowCloseConfirm(false);
  }

  async function handleInvalidateIncident(reason: string) {
    if (!selectedIncident) return;
    await patchIncident(selectedIncident.id, {
      status: 'INVALIDATED',
      invalidationReason: reason.trim(),
    });
    setShowInvalidateConfirm(false);
  }


  function getResponsibleDraft(incident: WorkshopIncident): string {
    if (Object.prototype.hasOwnProperty.call(responsibleDrafts, incident.id)) {
      return responsibleDrafts[incident.id] ?? '';
    }
    return incident.responsible_comment || '';
  }

  function updateResponsibleDraft(id: number, value: string) {
    setResponsibleDrafts((prev) => ({ ...prev, [id]: value }));
  }

  async function saveResponsibleComment(incident: WorkshopIncident) {
    const value = getResponsibleDraft(incident).trim();
    if (!value) return;
    const updated = await updateWorkshopIncident(incident.id, { responsibleComment: value });
    upsertIncident(updated);
    setResponsibleDrafts((prev) => {
      const next = { ...prev };
      delete next[incident.id];
      return next;
    });
  }

  async function deleteResponsibleComment(incident: WorkshopIncident) {
    const updated = await updateWorkshopIncident(incident.id, { responsibleComment: '' });
    upsertIncident(updated);
    setDeleteResponsibleCommentIncident(null);
    setResponsibleDrafts((prev) => {
      const next = { ...prev };
      delete next[incident.id];
      return next;
    });
  }

  async function handleToggleUrgent(incident: WorkshopIncident) {
    const updated = await updateWorkshopIncident(incident.id, { isPriority: !incident.is_priority });
    upsertIncident(updated);
  }

  async function handleToggleFollow(incident: WorkshopIncident) {
    if (
      incident.is_followed &&
      (incident.status === 'CLOSED' || incident.status === 'CANCELED' || incident.status === 'INVALIDATED') &&
      unfollowConfirmIncident?.id !== incident.id
    ) {
      setUnfollowConfirmIncident(incident);
      return;
    }
    const updated = incident.is_followed
      ? await unfollowWorkshopIncident(incident.id)
      : await followWorkshopIncident(incident.id);
    upsertIncident(updated);
    setUnfollowConfirmIncident(null);
    void refreshMetrics();
  }

  const filteredIncidents = incidents.filter((incident) => {
    const isResolved = incident.status === 'CLOSED' || incident.status === 'CANCELED' || incident.status === 'INVALIDATED';
    if (filters.scope === 'followed' && !incident.is_followed) return false;
    if (filters.scope === 'assigned_to_me' && incident.taken_by_user_id !== user?.id) return false;
    if (filters.scope === 'created_by_me' && incident.user_id !== user?.id) return false;
    if (filters.scope !== 'followed' && (incident.status === 'CANCELED' || incident.status === 'INVALIDATED')) return false;
    if (filters.scope !== 'followed' && filters.status === 'all' && filters.aging === 'all' && incident.status === 'CLOSED') return false;
    if ((filters.scope === 'assigned_to_me' || filters.scope === 'created_by_me') && isResolved) return false;
    if (filters.lineId !== 'all' && String(incident.line_id) !== filters.lineId) return false;
    if (filters.status !== 'all' && incident.status !== filters.status) return false;
    if (filters.status === 'CLOSED' && !isWithinLastDays(incident.updated_at || incident.created_at, 7)) return false;
    if (filters.aging === 'over_7d' && (
      incident.status === 'CLOSED' || isWithinLastDays(incident.created_at, 7)
    )) return false;
    if (filters.priority === 'urgent' && !incident.is_priority) return false;
    if (filters.priority === 'normal' && incident.is_priority) return false;
    if (filters.taken === 'taken' && !incident.is_taken) return false;
    if (filters.taken === 'not_taken' && incident.is_taken) return false;
    if (filters.query.trim()) {
      const q = filters.query.trim().toLowerCase();
      const haystack = [
        incident.line_number,
        incident.machine_id,
        incident.robot_label,
        incident.current_product,
        incident.first_name,
        incident.last_name,
        incident.machine_brand,
        incident.comment,
        incident.diagnostic,
        incident.responsible_comment,
      ].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const createdByMeCount = isOperator
    ? incidents.filter((incident) => {
        const isResolved = incident.status === 'CLOSED' || incident.status === 'CANCELED' || incident.status === 'INVALIDATED';
        return incident.user_id === user?.id && !isResolved;
      }).length
    : 0;

  const sortedIncidents = sortOrder === 'default'
    ? filteredIncidents
    : [...filteredIncidents].sort((a, b) => {
        const diff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        return sortOrder === 'date_desc' ? diff : -diff;
      });

  async function handleMaintenanceDeleteConfirm() {
    if (maintenanceDeleteMode === 'approve' && reviewIncident) {
      await deleteWorkshopIncident(reviewIncident.id);
      setIncidents((prev) => sortIncidents(prev.map((item) => (
        item.id === reviewIncident.id ? { ...item, status: 'CANCELED', cancel_request: false, cancel_request_reason: null } : item
      ))));
      if (selectedIncident?.id === reviewIncident.id) clearSelectedIncident();
      void refreshMetrics();
      closeReview();
    }
    if (maintenanceDeleteMode === 'direct' && selectedIncident) {
      await deleteWorkshopIncident(selectedIncident.id);
      setIncidents((prev) => sortIncidents(prev.map((item) => (
        item.id === selectedIncident.id ? { ...item, status: 'CANCELED', cancel_request: false, cancel_request_reason: null } : item
      ))));
      clearSelectedIncident();
      void refreshMetrics();
    }
    setShowMaintenanceDeleteConfirm(false);
    setMaintenanceDeleteMode(null);
  }

  if (selectedIncident) {
    const canRequestEdit = canPerform(user?.role, 'requestEdit', selectedIncident, user?.id);
    const canDirectEdit = canPerform(user?.role, 'directEdit', selectedIncident);
    const canRequestCancel = canPerform(user?.role, 'requestCancel', selectedIncident, user?.id);
    const canCancel = canPerform(user?.role, 'cancel', selectedIncident);
    const canTake = canPerform(user?.role, 'take', selectedIncident);
    const canSetPending = canPerform(user?.role, 'setPending', selectedIncident);
    const canResume = canPerform(user?.role, 'resume', selectedIncident);
    const canClose = canPerform(user?.role, 'close', selectedIncident);
    const canSetPriority = canPerform(user?.role, 'setPriority', selectedIncident);
    const canEditResponsibleComment = canPerform(user?.role, 'responsibleComment', selectedIncident);
    const canInvalidateClosed = canPerform(user?.role, 'invalidateClosed', selectedIncident);
    const detailHasTreatmentActions = canSetPending || canResume || canClose || canSetPriority || canEditResponsibleComment;
    return (
      <>
        <WorkshopNavBar />
        <main id="main-content" className="page-container workshop-page">
          <button className="back-link" onClick={() => clearSelectedIncident()}>
            Retour à la liste
          </button>

        <div className="page-header">
          <h1>Incident {selectedIncident.line_number} · {selectedIncident.machine_id}</h1>
          {canAct && (
            <div className="action-bar" style={{ marginTop: 0 }}>
              {isResponsable && (
                <button
                  className={selectedIncident.is_followed ? 'btn btn-secondary' : 'btn btn-primary'}
                  onClick={() => handleToggleFollow(selectedIncident)}
                >
                  {selectedIncident.is_followed ? 'Retirer du suivi' : 'Suivre'}
                </button>
              )}
              {(canRequestEdit || canDirectEdit) && (
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowEdit(true)}
                >
                  {canRequestEdit ? 'Demander une correction' : 'Modifier'}
                </button>
              )}
              {canTake && (
                <button
                  className="btn btn-primary"
                  onClick={() => setShowTakeChargeConfirm(true)}
                >
                  Prendre en charge
                </button>
              )}
              {(canRequestCancel || canCancel) && (
                <button
                  className="btn btn-danger"
                  onClick={() =>
                    canCancel
                      ? openMaintenanceDeleteConfirm('direct')
                      : setShowDeleteRequest(true)
                  }
                >
                  {canCancel ? 'Annuler' : 'Demander annulation'}
                </button>
              )}
              {canInvalidateClosed && (
                <button
                  className="btn btn-danger"
                  onClick={() => setShowInvalidateConfirm(true)}
                >
                  Invalider
                </button>
              )}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-body">
              <div className="detail-grid">
                <DetailField label="Utilisateur">{selectedIncident.first_name} {selectedIncident.last_name}</DetailField>
                <DetailField label="Rôle créateur">{ROLE_LABELS[selectedIncident.role] || selectedIncident.role}</DetailField>
                <DetailField label="Équipe">{SHIFT_LABELS[selectedIncident.shift]}</DetailField>
                <DetailField label="État">{STATE_LABELS[selectedIncident.state]}</DetailField>
                <DetailField label="Ligne">{selectedIncident.line_number}</DetailField>
                <DetailField label="Machine">{selectedIncident.machine_id} · {selectedIncident.machine_brand}</DetailField>
                <DetailField label="Robot">{selectedIncident.robot_label}</DetailField>
                <DetailField label="Tête">{selectedIncident.head_number}</DetailField>
                <DetailField label="Prise en charge">{selectedIncident.is_taken ? 'Oui' : 'Non'}</DetailField>
                <DetailField label="Pris en charge par">
                  {selectedIncident.taken_by_first_name
                    ? `${selectedIncident.taken_by_first_name} ${selectedIncident.taken_by_last_name || ''}`.trim()
                    : '-'}
                </DetailField>
                <DetailField label="Priorité">{selectedIncident.is_priority ? 'Oui' : 'Non'}</DetailField>
                <DetailField label="Statut">{STATUS_LABELS[selectedIncident.status] || selectedIncident.status}</DetailField>
                <DetailField label="Produit en cours">{selectedIncident.current_product || '-'}</DetailField>
                <DetailField label="Création">{formatDateTime(selectedIncident.created_at)}</DetailField>
            </div>
            {selectedIncident.comment && (
              <p className="incident-comment">{selectedIncident.comment}</p>
            )}
            {selectedIncident.diagnostic && (
              <p className="incident-comment"><strong>Diagnostic :</strong> {selectedIncident.diagnostic}</p>
            )}
            {selectedIncident.intervention_note && (
              <p className="incident-comment"><strong>Intervention :</strong> {selectedIncident.intervention_note}</p>
            )}
            {selectedIncident.edit_request && (
              <div className="notice" style={{ marginTop: 16 }}>Demande de modification opérateur en attente.</div>
            )}
            {selectedIncident.cancel_request && (
              <div className="notice" style={{ marginTop: 16 }}>Demande d’annulation opérateur en attente.</div>
            )}
          </div>
        </div>


        {canAct && detailHasTreatmentActions && (
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-body">
              <div className="detail-field" style={{ marginBottom: 12 }}>
                <span className="detail-field-label">Coordination</span>
              </div>
              <div className="action-bar">
                {canResume && (
                  <button className="btn btn-secondary" onClick={() => setShowResumeConfirm(true)}>
                    Reprendre
                  </button>
                )}
                {canSetPending && (
                  <button className="btn btn-secondary" onClick={() => setShowPendingConfirm(true)}>
                    Mettre en attente
                  </button>
                )}
                {canClose && (
                  <button className="btn btn-primary" onClick={() => setShowCloseConfirm(true)}>
                    Clôturer
                  </button>
                )}
                {canSetPriority && (
                  <button className={selectedIncident.is_priority ? 'btn btn-secondary' : 'btn btn-danger'} onClick={() => handleToggleUrgent(selectedIncident)}>
                    {selectedIncident.is_priority ? 'Repasser normal' : 'Déclarer urgent'}
                  </button>
                )}
              </div>
              {canEditResponsibleComment && (
                <div className="incident-comment">
                  <div className="form-group">
                    <label className="form-label" htmlFor={`responsible-comment-detail-${selectedIncident.id}`}>
                      Consigne responsable
                    </label>
                    <textarea
                      id={`responsible-comment-detail-${selectedIncident.id}`}
                      className="form-input"
                      rows={3}
                      value={getResponsibleDraft(selectedIncident)}
                      onChange={(event) => updateResponsibleDraft(selectedIncident.id, event.target.value)}
                      placeholder="Consigne courte pour orienter le traitement"
                    />
                  </div>
                  <div className="action-bar">
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => saveResponsibleComment(selectedIncident)}
                      disabled={!getResponsibleDraft(selectedIncident).trim()}
                    >
                      {selectedIncident.responsible_comment ? 'Mettre à jour' : 'Ajouter'}
                    </button>
                    {selectedIncident.responsible_comment && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setDeleteResponsibleCommentIncident(selectedIncident)}
                      >
                        Retirer
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        {showEdit && (
          <CreateIncidentModal
            lines={lines}
            incident={selectedIncident}
            onClose={() => setShowEdit(false)}
            onSuccess={(updated) => {
              setShowEdit(false);
              setSelectedIncident(updated);
              setIncidents((prev) =>
                sortIncidents(prev.map((item) => (item.id === updated.id ? updated : item)))
              );
              void refreshMetrics();
            }}
            requestOnly={canRequestEdit}
          />
        )}

        {showDeleteRequest && selectedIncident && (
          <DeleteRequestModal
            incident={selectedIncident}
            onClose={() => setShowDeleteRequest(false)}
            onConfirm={handleRequestDelete}
          />
        )}

        {showTakeChargeConfirm && selectedIncident && (
          <TakeChargeConfirmModal
            incident={selectedIncident}
            onClose={() => setShowTakeChargeConfirm(false)}
            onConfirm={handleConfirmTakeCharge}
          />
        )}

        {showPendingConfirm && selectedIncident && (
          <PendingConfirmModal
            incident={selectedIncident}
            onClose={() => setShowPendingConfirm(false)}
            onConfirm={handleSetPending}
          />
        )}

        {showResumeConfirm && selectedIncident && (
          <ResumeIncidentConfirmModal
            incident={selectedIncident}
            onClose={() => setShowResumeConfirm(false)}
            onConfirm={handleResumeIncident}
          />
        )}

        {showCloseConfirm && selectedIncident && (
          <CloseIncidentModal
            incident={selectedIncident}
            onClose={() => setShowCloseConfirm(false)}
            onConfirm={handleCloseIncident}
          />
        )}

        {showInvalidateConfirm && selectedIncident && (
          <InvalidateIncidentModal
            incident={selectedIncident}
            onClose={() => setShowInvalidateConfirm(false)}
            onConfirm={handleInvalidateIncident}
          />
        )}

        {reviewIncident && reviewType && (
          <ReviewIncidentRequestModal
            incident={reviewIncident}
            lines={lines}
            type={reviewType}
            loading={reviewLoading}
            error={reviewError}
            onClose={closeReview}
            onApplyEdit={handleApplyEditRequest}
            onRejectEdit={handleRejectEditRequest}
            onApproveDelete={handleApproveDeleteRequest}
            onRejectDelete={handleRejectDeleteRequest}
            allowDeleteApproval={canPerform(user?.role, 'approveCancel', reviewIncident)}
            allowDeleteReject={canPerform(user?.role, 'rejectCancel', reviewIncident)}
            deleteApprovalDisabled={!canPerform(user?.role, 'approveCancel', reviewIncident)}
            deleteWarning={
              canPerform(user?.role, 'approveCancel', reviewIncident)
                ? "L’annulation conserve le signalement dans l’historique avec sa trace de décision."
                : undefined
            }
            allowEditApply={canPerform(user?.role, 'approveEdit', reviewIncident)}
            allowEditReject={canPerform(user?.role, 'rejectEdit', reviewIncident)}
            editDisabled={!canPerform(user?.role, 'approveEdit', reviewIncident)}
            editWarning={
              !canPerform(user?.role, 'approveEdit', reviewIncident)
                ? 'Seul le responsable peut arbitrer une demande de correction active.'
                : undefined
            }
          />
        )}

        {showMaintenanceDeleteConfirm && (selectedIncident || reviewIncident) && (
          <MaintenanceDeleteConfirmModal
            incident={maintenanceDeleteMode === 'approve' ? reviewIncident! : selectedIncident!}
            title={maintenanceDeleteMode === 'approve' ? 'Valider l’annulation' : 'Annuler le signalement'}
            message={maintenanceDeleteMode === 'approve'
              ? 'Cette validation annule le signalement demandé par l’opérateur et conserve la trace dans l’historique.'
              : 'Cette action annule le signalement et le conserve dans l’historique. Confirmez uniquement s’il s’agit d’une erreur ou d’un doublon.'}
            onClose={() => {
              setShowMaintenanceDeleteConfirm(false);
              setMaintenanceDeleteMode(null);
              setReviewLoading(false);
            }}
            onConfirm={handleMaintenanceDeleteConfirm}
          />
        )}
        {unfollowConfirmIncident && (
          <UnfollowIncidentConfirmModal
            incident={unfollowConfirmIncident}
            onClose={() => setUnfollowConfirmIncident(null)}
            onConfirm={() => handleToggleFollow(unfollowConfirmIncident)}
          />
        )}
        {deleteResponsibleCommentIncident && (
          <DeleteResponsibleCommentConfirmModal
            incident={deleteResponsibleCommentIncident}
            onClose={() => setDeleteResponsibleCommentIncident(null)}
            onConfirm={() => deleteResponsibleComment(deleteResponsibleCommentIncident)}
          />
        )}
        </main>
      </>
    );
  }

  return (
    <>
      <WorkshopNavBar />
      <main id="main-content" className="page-container workshop-page">
      <div className="page-header">
        <h1>Dashboard atelier</h1>
        <div className="action-bar" style={{ marginTop: 0 }}>
          {user && (
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              + Créer un incident
            </button>
          )}
          {!user && (
            <button className="btn btn-secondary" onClick={() => navigate('/workshop')}>
              Se connecter
            </button>
          )}
        </div>
      </div>

      {!user && (
        <div className="notice" style={{ marginBottom: 20 }}>
          Lecture seule : connectez-vous pour créer ou agir sur un incident.
        </div>
      )}

      {error && <ErrorBanner style={{ marginBottom: 16 }}>{error}</ErrorBanner>}

      <IncidentMetricsBar
        metricsLoading={metricsLoading}
        metrics={metrics}
        filters={filters}
        role={user?.role}
        createdByMeCount={createdByMeCount}
        onSetFilters={setFilters}
      />

      <div className="workshop-search-bar">
        <div className="filter-group workshop-search-filter">
          <span className="filter-label">Recherche</span>
          <input
            className="form-input"
            value={filters.query}
            onChange={(event) => setFilters((prev) => ({ ...prev, query: event.target.value }))}
            placeholder="Ligne, machine, robot, produit..."
          />
        </div>
        <div className="sort-toggle-group">
          <button
            type="button"
            className={`sort-toggle-btn${sortOrder === 'default' ? ' active' : ''}`}
            onClick={() => setSortOrder('default')}
          >
            Par défaut
          </button>
          <button
            type="button"
            className={`sort-toggle-btn${sortOrder === 'date_desc' ? ' active' : ''}`}
            onClick={() => setSortOrder('date_desc')}
          >
            Plus récent
          </button>
          <button
            type="button"
            className={`sort-toggle-btn${sortOrder === 'date_asc' ? ' active' : ''}`}
            onClick={() => setSortOrder('date_asc')}
          >
            Plus ancien
          </button>
        </div>
        <button className="btn btn-secondary workshop-filter-button" type="button" onClick={() => setShowFilters(true)}>
          Filtres{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </button>
      </div>

      <FilterSummary
        count={filteredIncidents.length}
        countLabel="incident(s) affiché(s)"
        chips={filterChips}
        onClear={clearAllFilters}
      />
      {isResponsable && sortedIncidents.length > 1 && sortOrder === 'default' && (
        <div className="reorder-help">
          Pour changer l’ordre de traitement, sélectionnez un incident puis glissez-le à la position voulue.
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <span className="spinner" style={{ width: 24, height: 24, borderWidth: 3 }} />
        </div>
      ) : sortedIncidents.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            {activeFilterCount > 0 ? 'Aucun incident ne correspond aux filtres.' : 'Aucun incident à traiter.'}
          </div>
        </div>
      ) : (
        <div className="incident-list">
          {sortedIncidents.map((incident) => (
            <IncidentCard
              key={incident.id}
              incident={incident}
              isDragging={draggedIncidentId === incident.id}
              isDropTarget={dragOverIncidentId === incident.id && draggedIncidentId !== incident.id}
              canReorder={sortOrder === 'default' && canPerform(user?.role, 'reorder', incident)}
              isResponsable={isResponsable}
              isMaintenance={isMaintenance}
              onToggleFollow={handleToggleFollow}
              onDragStart={(event, id) => {
                setDraggedIncidentId(id);
              }}
              onDragOver={(_event, id, clientY) => {
                if (draggedIncidentId && draggedIncidentId !== id) {
                  scheduleAutoScroll(clientY);
                  setDropTarget(id);
                }
              }}
              onDragLeave={(id) => {
                if (dragOverIncidentId === id) setDragOverIncidentId(null);
              }}
              onDrop={(_event, id) => {
                void reorderDraggedIncident(id);
              }}
              onDragEnd={resetDragState}
              onClick={(inc) => {
                setSelectedIncident(inc);
                setIncidentUrlParam(inc.id);
                if (isResponsable && inc.cancel_request) {
                  openReview(inc, 'delete');
                  return;
                }
                if (isResponsable && inc.edit_request) {
                  openReview(inc, 'edit');
                }
              }}
              onReviewEdit={(_event, inc) => openReview(inc, 'edit')}
              onReviewDelete={(_event, inc) => openReview(inc, 'delete')}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateIncidentModal
          lines={lines}
          onClose={() => setShowCreate(false)}
          onSuccess={(incident) => {
            setShowCreate(false);
            setIncidents((prev) => sortIncidents([incident, ...prev]));
            void refreshMetrics();
          }}
        />
      )}
      {showFilters && (
        <DashboardFilters
          lines={lines}
          filters={filters}
          onSetFilters={setFilters}
          onClose={() => setShowFilters(false)}
          filteredCount={filteredIncidents.length}
          filterChips={filterChips}
        />
      )}
      {unfollowConfirmIncident && (
        <UnfollowIncidentConfirmModal
          incident={unfollowConfirmIncident}
          onClose={() => setUnfollowConfirmIncident(null)}
          onConfirm={() => handleToggleFollow(unfollowConfirmIncident)}
        />
      )}
      {deleteResponsibleCommentIncident && (
        <DeleteResponsibleCommentConfirmModal
          incident={deleteResponsibleCommentIncident}
          onClose={() => setDeleteResponsibleCommentIncident(null)}
          onConfirm={() => deleteResponsibleComment(deleteResponsibleCommentIncident)}
        />
      )}
      </main>
    </>
  );
}
