import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import CreateIncidentModal from '../components/CreateIncidentModal';
import IncidentMetricsBar from '../components/IncidentMetricsBar';
import DashboardFilters from '../components/DashboardFilters';
import IncidentCard from '../components/IncidentCard';
import UnfollowIncidentConfirmModal from '../components/UnfollowIncidentConfirmModal';
import DeleteResponsibleCommentConfirmModal from '../components/DeleteResponsibleCommentConfirmModal';
import ReviewIncidentRequestModal from '../components/ReviewIncidentRequestModal';
import WorkshopNavBar from '../components/WorkshopNavBar';
import FilterSummary from '../components/FilterSummary';
import ErrorBanner from '../components/ui/ErrorBanner';
import SelectField from '../components/ui/SelectField';
import IncidentDetailPanel from '../components/IncidentDetailPanel';
import { updateWorkshopIncident } from '../api/workshop';
import { useAppAuth } from '../routes/AppAuthContext';
import { WorkshopIncident } from '../types';
import { canPerform } from '../utils/workshopPermissions';
import { sortIncidents } from '../utils/incidentSort';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  useDashboardFilters,
  DashboardFilters as DashboardFiltersState,
} from '../hooks/useDashboardFilters';
import { useDragDrop } from '../hooks/useDragDrop';
import { useIncidentsData } from '../hooks/useIncidentsData';
import { useModalState } from '../hooks/useModalState';
import { useIncidentActions } from '../hooks/useIncidentActions';

function isWithinLastDays(iso: string, days: number): boolean {
  const createdAt = new Date(iso).getTime();
  const limit = Date.now() - days * 24 * 60 * 60 * 1000;
  return createdAt >= limit;
}

export default function WorkshopDashboardPage() {
  usePageTitle('Tableau de bord atelier');
  const { session } = useAppAuth();
  const user = session?.accountType === 'workshop' ? session.user : null;
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedIncident, setSelectedIncident] = useState<WorkshopIncident | null>(null);
  const [sortOrder, setSortOrder] = useState<'default' | 'date_desc' | 'date_asc'>('default');
  const [filters, setFilters] = useState<DashboardFiltersState>({
    lineId: searchParams.get('line') ?? 'all',
    status: 'all',
    priority: searchParams.get('priority') ?? 'all',
    taken: searchParams.get('taken') ?? 'all',
    scope: 'all',
    query: '',
    aging: searchParams.get('age') ?? 'all',
  });

  const {
    lines,
    incidents,
    metrics,
    metricsLoading,
    loading,
    error,
    setIncidents,
    refreshMetrics,
    upsertIncident,
  } = useIncidentsData();
  const modal = useModalState();
  const { filterChips, activeFilterCount, clearAllFilters } = useDashboardFilters({
    filters,
    setFilters,
    lines,
  });
  const {
    draggedIncidentId,
    dragOverIncidentId,
    setDraggedIncidentId,
    scheduleAutoScroll,
    setDropTarget,
    clearDropTarget,
    resetDragState,
  } = useDragDrop();

  const isOperator = user?.role === 'OPERATOR';
  const isMaintenance = user?.role === 'MAINTENANCE';
  const isResponsable = user?.role === 'RESPONSABLE';
  const selectedIncidentParam = searchParams.get('incident');

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

  useEffect(() => {
    if (!selectedIncidentParam) {
      setSelectedIncident(null);
      return;
    }
    const found = incidents.find((inc) => String(inc.id) === selectedIncidentParam);
    if (found) {
      setSelectedIncident(found);
      return;
    }
    if (!loading && incidents.length > 0) {
      setIncidentUrlParam(null, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIncidentParam, incidents, loading]);

  const filteredIncidents = incidents.filter((incident) => {
    const isResolved =
      incident.status === 'CLOSED' ||
      incident.status === 'CANCELED' ||
      incident.status === 'INVALIDATED';
    if (filters.scope === 'followed' && !incident.is_followed) return false;
    if (filters.scope === 'assigned_to_me' && incident.taken_by_user_id !== user?.id) return false;
    if (filters.scope === 'created_by_me' && incident.user_id !== user?.id) return false;
    if (filters.scope === 'requests' && !incident.edit_request && !incident.cancel_request)
      return false;
    if (
      filters.scope !== 'followed' &&
      (incident.status === 'CANCELED' || incident.status === 'INVALIDATED')
    )
      return false;
    if (
      filters.scope !== 'followed' &&
      filters.status === 'all' &&
      filters.aging === 'all' &&
      incident.status === 'CLOSED'
    )
      return false;
    if ((filters.scope === 'assigned_to_me' || filters.scope === 'created_by_me') && isResolved)
      return false;
    if (filters.lineId !== 'all' && String(incident.line_id) !== filters.lineId) return false;
    if (filters.status !== 'all' && incident.status !== filters.status) return false;
    if (
      filters.status === 'CLOSED' &&
      !isWithinLastDays(incident.updated_at ?? incident.created_at, 7)
    )
      return false;
    if (
      filters.aging === 'over_7d' &&
      (incident.status === 'CLOSED' || isWithinLastDays(incident.created_at, 7))
    )
      return false;
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
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const createdByMeCount = isOperator
    ? incidents.filter((inc) => {
        const isResolved =
          inc.status === 'CLOSED' || inc.status === 'CANCELED' || inc.status === 'INVALIDATED';
        return inc.user_id === user?.id && !isResolved;
      }).length
    : 0;

  // Inbox d'arbitrage du responsable : demandes de correction/annulation en attente.
  const requestsCount = isResponsable
    ? incidents.filter((inc) => {
        const isResolved =
          inc.status === 'CLOSED' || inc.status === 'CANCELED' || inc.status === 'INVALIDATED';
        return !isResolved && (Boolean(inc.edit_request) || Boolean(inc.cancel_request));
      }).length
    : 0;

  const sortedIncidents =
    sortOrder === 'default'
      ? filteredIncidents
      : [...filteredIncidents].sort((a, b) => {
          const diff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          return sortOrder === 'date_desc' ? diff : -diff;
        });

  const actions = useIncidentActions({
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
    userRole: user?.role,
  });

  async function handleDeleteCommentConfirm(incident: WorkshopIncident) {
    const updated = await updateWorkshopIncident(incident.id, { responsibleComment: '' });
    upsertIncident(updated);
    modal.setDeleteCommentConfirm(null);
  }

  // Position de l'incident ouvert dans la liste affichée (triée + filtrée) :
  // porte la navigation précédent/suivant du drawer.
  const selectedIndex = selectedIncident
    ? sortedIncidents.findIndex((inc) => inc.id === selectedIncident.id)
    : -1;

  function navigateToIncident(offset: number) {
    if (selectedIndex === -1) return;
    const next = sortedIncidents[selectedIndex + offset];
    if (!next) return;
    setSelectedIncident(next);
    // replace : feuilleter les incidents ne doit pas empiler l'historique.
    setIncidentUrlParam(next.id, true);
  }

  // Un modal ouvert capte déjà Escape : le panneau ne doit pas se fermer en dessous.
  const anyModalOpen =
    modal.state.activeModal !== null ||
    modal.state.reviewIncident !== null ||
    modal.state.unfollowConfirmIncident !== null ||
    modal.state.deleteResponsibleCommentIncident !== null;

  useEffect(() => {
    if (!selectedIncident || anyModalOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') clearSelectedIncident();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIncident, anyModalOpen]);

  return (
    <>
      <WorkshopNavBar />
      <main id="main-content" className="page-container workshop-page">
        <div className="page-header">
          <h1>Tableau de bord atelier</h1>
          <div className="action-bar" style={{ marginTop: 0 }}>
            <button className="btn btn-primary" onClick={() => modal.openModal('create')}>
              + Créer un incident
            </button>
          </div>
        </div>

        {error && <ErrorBanner style={{ marginBottom: 16 }}>{error}</ErrorBanner>}

        <IncidentMetricsBar
          metricsLoading={metricsLoading}
          metrics={metrics}
          filters={filters}
          role={user?.role}
          createdByMeCount={createdByMeCount}
          requestsCount={requestsCount}
          onSetFilters={setFilters}
        />

        <div className="workshop-search-bar">
          <div className="filter-group workshop-search-filter">
            <label className="filter-label" htmlFor="dashboard-search">
              Recherche
            </label>
            <input
              id="dashboard-search"
              className="form-input"
              value={filters.query}
              onChange={(e) => setFilters((prev) => ({ ...prev, query: e.target.value }))}
              placeholder="Ligne, machine, robot, produit..."
            />
          </div>
          <div className="filter-group workshop-sort-filter">
            <span className="filter-label" aria-hidden="true">
              Tri
            </span>
            <SelectField
              value={sortOrder}
              onChange={(value) => setSortOrder(value as 'default' | 'date_desc' | 'date_asc')}
              ariaLabel="Ordre de tri"
              options={[
                { value: 'default', label: 'Ordre de traitement' },
                { value: 'date_desc', label: 'Plus récent' },
                { value: 'date_asc', label: 'Plus ancien' },
              ]}
            />
          </div>
          <button
            className="btn btn-secondary workshop-filter-button"
            type="button"
            onClick={() => modal.openModal('filters')}
          >
            Filtres{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </button>
        </div>

        <FilterSummary
          count={filteredIncidents.length}
          countLabel="incident(s) affiché(s)"
          chips={filterChips}
          onClear={clearAllFilters}
        />

        <div>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
              <span
                className="spinner"
                aria-hidden="true"
                style={{ width: 24, height: 24, borderWidth: 3 }}
              />
            </div>
          ) : sortedIncidents.length === 0 ? (
            <div className="card">
              <div className="empty-state incident-empty-state">
                {activeFilterCount > 0 ? (
                  <>
                    <p>Aucun incident ne correspond aux filtres.</p>
                    <button className="btn btn-secondary" onClick={clearAllFilters}>
                      Effacer les filtres
                    </button>
                  </>
                ) : (
                  <>
                    <p>Aucun incident à traiter. L'atelier est stable.</p>
                    <button className="btn btn-primary" onClick={() => modal.openModal('create')}>
                      + Créer un incident
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="incident-list">
              {sortedIncidents.map((incident) => (
                <IncidentCard
                  key={incident.id}
                  incident={incident}
                  isSelected={selectedIncident?.id === incident.id}
                  isDragging={draggedIncidentId === incident.id}
                  isDropTarget={
                    dragOverIncidentId === incident.id && draggedIncidentId !== incident.id
                  }
                  canReorder={
                    sortOrder === 'default' && canPerform(user?.role, 'reorder', incident)
                  }
                  isResponsable={isResponsable}
                  isMaintenance={isMaintenance}
                  onToggleFollow={actions.handleToggleFollow}
                  onDragStart={(_e, id) => setDraggedIncidentId(id)}
                  onDragOver={(_e, id, clientY) => {
                    if (draggedIncidentId && draggedIncidentId !== id) {
                      scheduleAutoScroll(clientY);
                      setDropTarget(id);
                    }
                  }}
                  onDragLeave={(id) => clearDropTarget(id)}
                  onDrop={(_e, id) => void actions.reorderDraggedIncident(id)}
                  onDragEnd={resetDragState}
                  onClick={(inc) => {
                    setSelectedIncident(inc);
                    setIncidentUrlParam(inc.id);
                    if (isResponsable && inc.cancel_request) {
                      modal.openReview(inc, 'delete');
                      return;
                    }
                    if (isResponsable && inc.edit_request) {
                      modal.openReview(inc, 'edit');
                    }
                  }}
                  onReviewEdit={(_e, inc) => modal.openReview(inc, 'edit')}
                  onReviewDelete={(_e, inc) => modal.openReview(inc, 'delete')}
                />
              ))}
            </div>
          )}
        </div>

        {selectedIncident && (
          <aside
            className="incident-detail-drawer"
            aria-label={`Détail de l'incident ligne ${selectedIncident.line_number}, machine ${selectedIncident.machine_id}`}
          >
            <IncidentDetailPanel
              incident={selectedIncident}
              lines={lines}
              modal={modal}
              userRole={user?.role}
              userId={user?.id}
              isMaintenance={isMaintenance}
              isResponsable={isResponsable}
              navigation={
                selectedIndex >= 0
                  ? {
                      index: selectedIndex,
                      total: sortedIncidents.length,
                      onPrev: () => navigateToIncident(-1),
                      onNext: () => navigateToIncident(1),
                    }
                  : undefined
              }
              onBack={() => clearSelectedIncident()}
              onToggleFollow={actions.handleToggleFollow}
              onToggleUrgent={actions.handleToggleUrgent}
              onConfirmTakeCharge={actions.handleConfirmTakeCharge}
              onRequestDelete={actions.handleRequestDelete}
              onSetPending={actions.handleSetPending}
              onResumeIncident={actions.handleResumeIncident}
              onCloseIncident={actions.handleCloseIncident}
              onInvalidateIncident={actions.handleInvalidateIncident}
              onMaintenanceDeleteConfirm={actions.handleMaintenanceDeleteConfirm}
              onApplyEditRequest={actions.handleApplyEditRequest}
              onRejectEditRequest={actions.handleRejectEditRequest}
              onApproveDeleteRequest={actions.handleApproveDeleteRequest}
              onRejectDeleteRequest={actions.handleRejectDeleteRequest}
              onEditSuccess={(updated) => {
                upsertIncident(updated);
                setSelectedIncident(updated);
                void refreshMetrics();
              }}
              onDeleteCommentConfirm={handleDeleteCommentConfirm}
              patchIncident={async (id, payload) => {
                const updated = await updateWorkshopIncident(id, payload);
                setIncidents((prev) =>
                  sortIncidents(prev.map((item) => (item.id === updated.id ? updated : item)))
                );
                setSelectedIncident(updated);
                void refreshMetrics();
                return updated;
              }}
            />
          </aside>
        )}

        {modal.state.activeModal === 'create' && (
          <CreateIncidentModal
            lines={lines}
            onClose={() => modal.closeModal()}
            onSuccess={(incident) => {
              modal.closeModal();
              setIncidents((prev) => sortIncidents([incident, ...prev]));
              void refreshMetrics();
            }}
          />
        )}

        {modal.state.activeModal === 'filters' && (
          <DashboardFilters
            lines={lines}
            filters={filters}
            onSetFilters={setFilters}
            onClose={() => modal.closeModal()}
            filteredCount={filteredIncidents.length}
            filterChips={filterChips}
          />
        )}

        {/* Ces trois modals sont aussi rendus par IncidentDetailPanel : quand le
            panneau est ouvert, c'est lui qui les porte (sinon double rendu). */}
        {!selectedIncident && modal.state.reviewIncident && modal.state.reviewType && (
          <ReviewIncidentRequestModal
            incident={modal.state.reviewIncident}
            lines={lines}
            type={modal.state.reviewType}
            loading={modal.state.reviewLoading}
            error={modal.state.reviewError}
            onClose={modal.closeReview}
            onApplyEdit={actions.handleApplyEditRequest}
            onRejectEdit={actions.handleRejectEditRequest}
            onApproveDelete={actions.handleApproveDeleteRequest}
            onRejectDelete={actions.handleRejectDeleteRequest}
            allowDeleteApproval={canPerform(
              user?.role,
              'approveCancel',
              modal.state.reviewIncident
            )}
            allowDeleteReject={canPerform(user?.role, 'rejectCancel', modal.state.reviewIncident)}
            deleteApprovalDisabled={
              !canPerform(user?.role, 'approveCancel', modal.state.reviewIncident)
            }
            deleteWarning={
              canPerform(user?.role, 'approveCancel', modal.state.reviewIncident)
                ? "L'annulation conserve l'incident dans l'historique avec sa trace de décision."
                : undefined
            }
            allowEditApply={canPerform(user?.role, 'approveEdit', modal.state.reviewIncident)}
            allowEditReject={canPerform(user?.role, 'rejectEdit', modal.state.reviewIncident)}
            editDisabled={!canPerform(user?.role, 'approveEdit', modal.state.reviewIncident)}
            editWarning={
              !canPerform(user?.role, 'approveEdit', modal.state.reviewIncident)
                ? 'Seul le responsable peut arbitrer une demande de correction active.'
                : undefined
            }
          />
        )}

        {!selectedIncident && modal.state.unfollowConfirmIncident && (
          <UnfollowIncidentConfirmModal
            incident={modal.state.unfollowConfirmIncident}
            onClose={() => modal.setUnfollowConfirm(null)}
            onConfirm={() => actions.handleToggleFollow(modal.state.unfollowConfirmIncident!)}
          />
        )}

        {!selectedIncident && modal.state.deleteResponsibleCommentIncident && (
          <DeleteResponsibleCommentConfirmModal
            incident={modal.state.deleteResponsibleCommentIncident}
            onClose={() => modal.setDeleteCommentConfirm(null)}
            onConfirm={() =>
              handleDeleteCommentConfirm(modal.state.deleteResponsibleCommentIncident!)
            }
          />
        )}
      </main>
    </>
  );
}
