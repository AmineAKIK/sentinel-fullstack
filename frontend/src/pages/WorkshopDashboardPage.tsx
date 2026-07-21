import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
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
import { isIncidentResolved } from '../components/IncidentBadges';
import { consultWorkshopArbitration, updateWorkshopIncident } from '../api/workshop';
import { useAppAuth } from '../routes/AppAuthContext';
import { WorkshopIncident } from '../types';
import { canPerform } from '../utils/workshopPermissions';
import { sortIncidents, groupIncidentsByLine } from '../utils/incidentSort';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  useDashboardFilters,
  DashboardFilters as DashboardFiltersState,
} from '../hooks/useDashboardFilters';
import { useIncidentsData } from '../hooks/useIncidentsData';
import { useFollowedResolvedIncidents } from '../hooks/useFollowedResolvedIncidents';
import { useModalState, ReviewType } from '../hooks/useModalState';
import { useIncidentActions } from '../hooks/useIncidentActions';
import { useIncidentDrawerPosition } from '../hooks/useIncidentDrawerPosition';

function isWithinLastDays(iso: string, days: number): boolean {
  const createdAt = new Date(iso).getTime();
  const limit = Date.now() - days * 24 * 60 * 60 * 1000;
  return createdAt >= limit;
}

type PendingReviewRequest = {
  incidentId: number;
  type: ReviewType;
};

function isArbitrationRequestActive(incident: WorkshopIncident, type: ReviewType): boolean {
  if (type === 'edit') {
    if (!incident.edit_request) return false;
    return incident.arbitration?.edit?.state !== 'WAITING';
  }
  if (!incident.cancel_request) return false;
  return incident.arbitration?.cancel?.state !== 'WAITING';
}

function getAutoReviewType(incident: WorkshopIncident): ReviewType | null {
  if (isArbitrationRequestActive(incident, 'delete')) return 'delete';
  if (isArbitrationRequestActive(incident, 'edit')) return 'edit';
  return null;
}

function getActiveArbitrationKey(incident: WorkshopIncident): string | null {
  const parts: string[] = [];
  if (isArbitrationRequestActive(incident, 'edit')) {
    parts.push(`edit:${incident.arbitration?.edit?.requestEventId ?? 'pending'}`);
  }
  if (isArbitrationRequestActive(incident, 'delete')) {
    parts.push(`delete:${incident.arbitration?.cancel?.requestEventId ?? 'pending'}`);
  }
  return parts.length > 0 ? `${incident.id}:${parts.join('|')}` : null;
}

export default function WorkshopDashboardPage() {
  usePageTitle('Tableau de bord atelier');
  const { session } = useAppAuth();
  const user = session?.accountType === 'workshop' ? session.user : null;
  const [searchParams, setSearchParams] = useSearchParams();
  const workbenchRef = useRef<HTMLDivElement | null>(null);
  const detailDrawerRef = useRef<HTMLElement | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<WorkshopIncident | null>(null);
  const [focusedIncidentId, setFocusedIncidentId] = useState<number | null>(null);
  const [pendingReviewRequest, setPendingReviewRequest] = useState<PendingReviewRequest | null>(
    null
  );
  const [reportedArbitrationKey, setReportedArbitrationKey] = useState<string | null>(null);
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
    refreshData,
    upsertIncident: upsertIncidentData,
  } = useIncidentsData();
  const upsertIncident = useCallback(
    (updated: WorkshopIncident) => {
      upsertIncidentData(updated);
      setSelectedIncident((current) => (current?.id === updated.id ? updated : current));
    },
    [setSelectedIncident, upsertIncidentData]
  );
  const {
    followedResolvedIncidents,
    followedResolvedLoading,
    followedResolvedLoadingMore,
    followedResolvedHasMore,
    followedResolvedError,
    loadMoreFollowedResolved,
  } = useFollowedResolvedIncidents(filters.scope === 'followed');
  const modal = useModalState();
  const { closeReview, openReview } = modal;
  const { activeModal, reviewIncident } = modal.state;
  const { filterChips, activeFilterCount, clearAllFilters } = useDashboardFilters({
    filters,
    setFilters,
    lines,
  });
  const isOperator = user?.role === 'OPERATOR';
  const isMaintenance = user?.role === 'MAINTENANCE';
  const isResponsable = user?.role === 'RESPONSABLE';
  const selectedIncidentParam = searchParams.get('incident');

  const setIncidentUrlParam = useCallback(
    (id: number | null, replace = false) => {
      const nextParams = new URLSearchParams(searchParams);
      if (id === null) {
        nextParams.delete('incident');
      } else {
        nextParams.set('incident', String(id));
      }
      setSearchParams(nextParams, { replace });
    },
    [searchParams, setSearchParams]
  );

  const clearSelectedIncident = useCallback(
    (replace = true) => {
      setSelectedIncident(null);
      setFocusedIncidentId(null);
      setPendingReviewRequest(null);
      setIncidentUrlParam(null, replace);
    },
    [setIncidentUrlParam, setSelectedIncident, setFocusedIncidentId, setPendingReviewRequest]
  );

  useEffect(() => {
    if (!selectedIncidentParam) {
      setSelectedIncident(null);
      setFocusedIncidentId(null);
      setPendingReviewRequest(null);
      if (reviewIncident) closeReview();
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
  }, [selectedIncidentParam, incidents, loading, reviewIncident, closeReview, setIncidentUrlParam]);

  useEffect(() => {
    setReportedArbitrationKey(null);
  }, [selectedIncident?.id]);

  // DR-12 : la projection active reste toujours complète (incidents) ; les
  // suivis résolus (followedResolvedIncidents) ne sont fusionnés dans la vue
  // que le temps où le filtre « Suivis » est actif — jamais mélangés dans le
  // rafraîchissement périodique du Dashboard.
  const scopedIncidents =
    filters.scope === 'followed' ? [...incidents, ...followedResolvedIncidents] : incidents;

  const filteredIncidents = scopedIncidents.filter((incident) => {
    const isResolved = isIncidentResolved(incident);
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
    ? incidents.filter((inc) => inc.user_id === user?.id && !isIncidentResolved(inc)).length
    : 0;

  // Inbox d'arbitrage du responsable : demandes de correction/annulation en attente.
  const requestsCount = isResponsable
    ? incidents.filter(
        (inc) =>
          !isIncidentResolved(inc) && (Boolean(inc.edit_request) || Boolean(inc.cancel_request))
      ).length
    : 0;

  const sortedIncidents =
    sortOrder === 'default'
      ? filteredIncidents
      : [...filteredIncidents].sort((a, b) => {
          const diff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          return sortOrder === 'date_desc' ? diff : -diff;
        });
  const sortedIncidentPositionKey = sortedIncidents.map((incident) => incident.id).join('|');

  // Regroupement sémantique par ligne : les groupes sont ordonnés 1-9/A-Z de
  // façon fixe (indépendante du tri/filtre actif), le tri/filtre choisis par
  // l'utilisateur ne s'appliquent qu'à l'intérieur de chaque groupe (l'ordre
  // relatif de sortedIncidents est préservé lors du regroupement).
  const lineGroups = groupIncidentsByLine(sortedIncidents);

  const actions = useIncidentActions({
    selectedIncident,
    clearSelectedIncident,
    upsertIncident,
    setIncidents,
    refreshMetrics,
    modal,
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
  const selectedIncidentId = selectedIncident?.id ?? null;
  const selectedIncidentUpdatedAt = selectedIncident?.updated_at ?? null;

  const { detailOffsetTop } = useIncidentDrawerPosition({
    workbenchRef,
    detailDrawerRef,
    selectedIncidentId,
    selectedIncidentUpdatedAt,
    sortedIncidentPositionKey,
    loading,
    sortOrder,
    setFocusedIncidentId,
  });

  function navigateToIncident(offset: number) {
    if (selectedIndex === -1) return;
    const next = sortedIncidents[selectedIndex + offset];
    if (!next) return;
    setSelectedIncident(next);
    setFocusedIncidentId(null);
    setPendingReviewRequest(null);
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
  }, [selectedIncident, anyModalOpen, clearSelectedIncident]);

  useEffect(() => {
    if (!isResponsable || !selectedIncident || reviewIncident || activeModal) {
      return;
    }
    if (focusedIncidentId !== selectedIncident.id || pendingReviewRequest) return;
    const reviewType = getAutoReviewType(selectedIncident);
    const arbitrationKey = getActiveArbitrationKey(selectedIncident);
    if (!reviewType || !arbitrationKey || arbitrationKey === reportedArbitrationKey) return;
    openReview(selectedIncident, reviewType);
  }, [
    isResponsable,
    selectedIncident,
    reviewIncident,
    activeModal,
    reportedArbitrationKey,
    focusedIncidentId,
    pendingReviewRequest,
    openReview,
  ]);

  useEffect(() => {
    if (
      !selectedIncident ||
      !pendingReviewRequest ||
      pendingReviewRequest.incidentId !== selectedIncident.id ||
      focusedIncidentId !== selectedIncident.id ||
      reviewIncident ||
      activeModal
    ) {
      return;
    }

    openReview(selectedIncident, pendingReviewRequest.type);
    setPendingReviewRequest(null);
  }, [
    selectedIncident,
    pendingReviewRequest,
    focusedIncidentId,
    reviewIncident,
    activeModal,
    openReview,
  ]);

  function openReviewFromIncident(incident: WorkshopIncident, reviewType: ReviewType) {
    setSelectedIncident(incident);
    setFocusedIncidentId(null);
    setPendingReviewRequest({ incidentId: incident.id, type: reviewType });
    setIncidentUrlParam(incident.id);
    setReportedArbitrationKey(null);
  }

  function handleReportArbitration(incident: WorkshopIncident | null) {
    if (incident) setReportedArbitrationKey(getActiveArbitrationKey(incident));
    setPendingReviewRequest(null);
    modal.closeReview();
  }

  async function handleConsultArbitration(incident: WorkshopIncident | null) {
    if (!incident || !modal.state.reviewType) return;
    modal.setReviewLoading(true);
    modal.setReviewError('');
    try {
      const requestType = modal.state.reviewType === 'edit' ? 'EDIT' : 'CANCEL';
      const result = await consultWorkshopArbitration(incident.id, requestType);
      upsertIncident(result.incident);
      if (selectedIncident?.id === incident.id) setSelectedIncident(result.incident);
      await refreshMetrics();
      modal.closeReview();
    } catch {
      modal.setReviewError("Impossible de passer le dossier d'arbitrage en consultation.");
    } finally {
      modal.setReviewLoading(false);
    }
  }

  const workbenchClassName = [
    'workshop-results-workbench',
    selectedIncident ? 'is-detail-open' : '',
    loading ? 'is-loading' : '',
    !loading && sortedIncidents.length === 0 ? 'is-empty' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const detailDrawerStyle = {
    '--incident-detail-offset-top': `${detailOffsetTop}px`,
  } as CSSProperties;

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

        {error && (
          <ErrorBanner style={{ marginBottom: 16 }}>
            <span>{error}</span>{' '}
            <button className="btn btn-secondary btn-sm" onClick={() => void refreshData()}>
              Réessayer
            </button>
          </ErrorBanner>
        )}

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

        <div ref={workbenchRef} className={workbenchClassName}>
          <section className="workshop-results-list-pane" aria-label="Liste des incidents atelier">
            {loading ? (
              <div className="workshop-results-loading">
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
              <div className="incident-line-groups">
                {lineGroups.map((group) => (
                  <section key={group.lineId} className="incident-line-group">
                    <h2 className="incident-line-group-header">Ligne {group.lineNumber}</h2>
                    <div className="incident-list">
                      {group.incidents.map((incident) => (
                        <IncidentCard
                          key={incident.id}
                          incident={incident}
                          isSelected={selectedIncident?.id === incident.id}
                          isResponsable={isResponsable}
                          isMaintenance={isMaintenance}
                          onToggleFollow={actions.handleToggleFollow}
                          onClick={(inc) => {
                            setSelectedIncident(inc);
                            setFocusedIncidentId(null);
                            setPendingReviewRequest(null);
                            setIncidentUrlParam(inc.id);
                          }}
                          onReviewEdit={(_e, inc) => openReviewFromIncident(inc, 'edit')}
                          onReviewDelete={(_e, inc) => openReviewFromIncident(inc, 'delete')}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}

            {filters.scope === 'followed' && followedResolvedError && (
              <ErrorBanner style={{ marginTop: 16 }}>{followedResolvedError}</ErrorBanner>
            )}

            {filters.scope === 'followed' && followedResolvedLoading && (
              <div className="workshop-results-loading">
                <span
                  className="spinner"
                  aria-hidden="true"
                  style={{ width: 20, height: 20, borderWidth: 3 }}
                />
              </div>
            )}

            {filters.scope === 'followed' && followedResolvedHasMore && (
              <div className="journal-load-more">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={loadMoreFollowedResolved}
                  disabled={followedResolvedLoadingMore}
                >
                  {followedResolvedLoadingMore ? 'Chargement…' : 'Charger la suite'}
                </button>
              </div>
            )}
          </section>

          {selectedIncident && (
            <aside
              ref={detailDrawerRef}
              className="incident-detail-drawer"
              style={detailDrawerStyle}
              aria-label={`Détail de l'incident ligne ${selectedIncident.line_number}, machine ${selectedIncident.machine_id}`}
            >
              <IncidentDetailPanel
                incident={selectedIncident}
                lines={lines}
                modal={modal}
                userRole={user?.role}
                userId={user?.id}
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
        </div>

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

        {modal.state.reviewIncident && modal.state.reviewType && (
          <ReviewIncidentRequestModal
            incident={modal.state.reviewIncident}
            lines={lines}
            type={modal.state.reviewType}
            loading={modal.state.reviewLoading}
            error={modal.state.reviewError}
            onClose={modal.closeReview}
            onConsult={() => void handleConsultArbitration(modal.state.reviewIncident)}
            onReport={() => handleReportArbitration(modal.state.reviewIncident)}
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
