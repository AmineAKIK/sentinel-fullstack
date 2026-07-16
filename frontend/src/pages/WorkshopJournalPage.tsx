import { useNavigate } from 'react-router-dom';
import { FilterChip } from '../components/FilterSummary';
import EmptyState from '../components/ui/EmptyState';
import ErrorBanner from '../components/ui/ErrorBanner';
import WorkshopNavBar from '../components/WorkshopNavBar';
import WorkshopFilterCard from '../components/WorkshopFilterCard';
import { STATUS_LABELS } from '../utils/labels';
import {
  EVENT_LABELS,
  formatDateTime,
  formatEventActor,
  formatEventDetail,
} from '../utils/workshopHistory';
import {
  lineFilterChip,
  machineFilterChip,
  searchFilterChip,
  stateFilterChip,
} from '../utils/workshopFilters';
import { usePageTitle } from '../hooks/usePageTitle';
import { useJournalData, SortCol } from '../hooks/useJournalData';

// Les 19 types d'événement effectivement émis par le backend (grep sur les
// appels logIncidentEvent). INCIDENT_REORDERED, ORDER_CHANGED (réordonnancement
// manuel retiré le 2026-07-07), DELETE_REQUESTED/DELETE_REQUEST_REJECTED
// (alias legacy de CANCEL_REQUESTED/CANCEL_REQUEST_REJECTED) et STATUS_CHANGED
// (type déclaré, jamais émis) sont volontairement exclus : les proposer au
// filtre créerait une entrée qui ne renverra jamais aucun résultat.
const EVENT_FILTER_OPTIONS = [
  'INCIDENT_CREATED',
  'INCIDENT_TAKEN',
  'INCIDENT_SET_PENDING',
  'INCIDENT_RESUMED',
  'INCIDENT_CLOSED',
  'INCIDENT_CANCELED',
  'INCIDENT_INVALIDATED',
  'INCIDENT_FOLLOWED',
  'INCIDENT_UNFOLLOWED',
  'INCIDENT_UPDATED',
  'EDIT_REQUESTED',
  'EDIT_APPLIED',
  'EDIT_REJECTED',
  'EDIT_REQUEST_WITHDRAWN',
  'CANCEL_REQUESTED',
  'CANCEL_REQUEST_REJECTED',
  'PRIORITY_CHANGED',
  'RESPONSIBLE_COMMENT_UPDATED',
  'ARBITRATION_CONSULTED',
] as const;

export default function WorkshopJournalPage() {
  usePageTitle('Journal');
  const navigate = useNavigate();

  const {
    lines,
    sortedEvents,
    historyEvents,
    historyEventsLoading,
    historyEventsLimit,
    error,
    query,
    statusFilter,
    lineFilter,
    machineFilter,
    stateFilter,
    eventTypeFilter,
    sortCol,
    sortDir,
    setQuery,
    setStatusFilter,
    setMachineFilter,
    setStateFilter,
    setEventTypeFilter,
    updateSearchFilter,
    updateLineFilter,
    clearFilters,
    handleSort,
  } = useJournalData();

  const filterChips: FilterChip[] = [
    ...searchFilterChip(query, () => {
      setQuery('');
      updateSearchFilter('q', '', '');
    }),
    ...(statusFilter !== 'all'
      ? [
          {
            key: 'status',
            label: `Statut: ${STATUS_LABELS[statusFilter] ?? statusFilter}`,
            onRemove: () => {
              setStatusFilter('all');
              updateSearchFilter('status', 'all');
            },
          },
        ]
      : []),
    ...lineFilterChip(lines, lineFilter, () => updateLineFilter('all')),
    ...machineFilterChip(machineFilter, () => {
      setMachineFilter('all');
      updateSearchFilter('machine', 'all');
    }),
    ...stateFilterChip(stateFilter, () => {
      setStateFilter('all');
      updateSearchFilter('state', 'all');
    }),
  ];

  return (
    <>
      <WorkshopNavBar />
      <main id="main-content" className="page-container workshop-page">
        <button className="back-link" onClick={() => void navigate('/workshop/dashboard')}>
          Retour au dashboard
        </button>

        <div className="page-header">
          <div>
            <h1>Journal atelier</h1>
            <p className="journal-intro">
              Qui a fait quoi, quand — traçabilité complète de l'atelier.
            </p>
          </div>
        </div>

        {error && <ErrorBanner style={{ marginBottom: 16 }}>{error}</ErrorBanner>}

        <WorkshopFilterCard
          searchInputId="journal-search"
          searchPlaceholder="Incident, machine, acteur, commentaire…"
          query={query}
          onQueryChange={(v) => {
            setQuery(v);
            updateSearchFilter('q', v, '');
          }}
          status={{
            value: statusFilter,
            onChange: (v) => {
              setStatusFilter(v);
              updateSearchFilter('status', v);
            },
          }}
          lines={lines}
          lineFilter={lineFilter}
          onLineFilterChange={updateLineFilter}
          machineFilter={machineFilter}
          onMachineFilterChange={(v) => {
            setMachineFilter(v);
            updateSearchFilter('machine', v);
          }}
          stateFilter={stateFilter}
          onStateFilterChange={(v) => {
            setStateFilter(v);
            updateSearchFilter('state', v);
          }}
          count={historyEvents.length}
          countLabel="action(s) affichée(s)"
          chips={filterChips}
          onClear={clearFilters}
          emptyText="Journal complet"
        />

        <div className="card">
          <div className="card-body">
            <div className="history-event-filter">
              <select
                className="history-event-select"
                value={eventTypeFilter}
                onChange={(e) => {
                  setEventTypeFilter(e.target.value);
                  updateSearchFilter('event', e.target.value);
                }}
              >
                <option value="all">Toutes les actions</option>
                {EVENT_FILTER_OPTIONS.map((key) => (
                  <option key={key} value={key}>
                    {EVENT_LABELS[key]}
                  </option>
                ))}
              </select>
              {eventTypeFilter !== 'all' && (
                <button
                  type="button"
                  className="filter-chip"
                  onClick={() => {
                    setEventTypeFilter('all');
                    updateSearchFilter('event', 'all');
                  }}
                  aria-label="Retirer le filtre action"
                >
                  <span>Action : {EVENT_LABELS[eventTypeFilter] ?? eventTypeFilter}</span>
                  <span aria-hidden="true">×</span>
                </button>
              )}
              <span className="history-event-count muted">
                {historyEventsLoading ? 'Chargement…' : `${historyEvents.length} action(s)`}
              </span>
              {!historyEventsLoading && historyEvents.length >= historyEventsLimit && (
                <span className="history-limit-notice">
                  Limite de {historyEventsLimit} — affinez les filtres.
                </span>
              )}
            </div>

            {/* Tableau desktop */}
            <div className="table-wrapper history-journal-table">
              <table className="change-table" style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '16%' }} />
                  <col style={{ width: '25%' }} />
                  <col style={{ width: '30%' }} />
                  <col />
                </colgroup>
                <thead>
                  <tr>
                    {(['date', 'action', 'incident', 'actor'] as SortCol[]).map((col) => {
                      const labels: Record<SortCol, string> = {
                        date: 'Date',
                        action: 'Action',
                        incident: 'Incident',
                        actor: 'Acteur',
                      };
                      const active = sortCol === col;
                      return (
                        <th
                          key={col}
                          scope="col"
                          aria-sort={
                            active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'
                          }
                        >
                          <button
                            type="button"
                            className={`sort-th-btn${active ? ' sort-th-active' : ''}`}
                            onClick={() => handleSort(col)}
                          >
                            {labels[col]}
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {historyEventsLoading ? (
                    <tr>
                      <td colSpan={4} className="empty-state">
                        Chargement…
                      </td>
                    </tr>
                  ) : sortedEvents.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="empty-state">
                        Aucune action.
                      </td>
                    </tr>
                  ) : (
                    sortedEvents.map((event) => {
                      const detail = formatEventDetail(event);
                      return (
                        <tr key={event.id}>
                          <td>{formatDateTime(event.created_at)}</td>
                          <td>
                            {EVENT_LABELS[event.event_type] ?? event.event_type}
                            {detail && <div className="muted">{detail}</div>}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="inline-link-button"
                              onClick={() =>
                                navigate(
                                  `/workshop/history?incident=${event.incident_id}&event=${event.id}`
                                )
                              }
                            >
                              Ligne {event.line_number} · {event.machine_id}
                            </button>
                            <div className="muted">
                              {STATUS_LABELS[event.status] ?? event.status}
                            </div>
                          </td>
                          <td>{formatEventActor(event)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Cards mobile */}
            <div className="history-journal-cards">
              {historyEventsLoading ? (
                <EmptyState>Chargement…</EmptyState>
              ) : historyEvents.length === 0 ? (
                <EmptyState>Aucune action.</EmptyState>
              ) : (
                historyEvents.map((event) => {
                  const detail = formatEventDetail(event);
                  return (
                    <div key={event.id} className="history-journal-card">
                      <div className="history-journal-card-top">
                        <strong>{EVENT_LABELS[event.event_type] ?? event.event_type}</strong>
                        <span className="muted">{formatDateTime(event.created_at)}</span>
                      </div>
                      {detail && <span className="muted">{detail}</span>}
                      <div className="history-journal-card-bottom">
                        <button
                          type="button"
                          className="inline-link-button"
                          onClick={() =>
                            navigate(
                              `/workshop/history?incident=${event.incident_id}&event=${event.id}`
                            )
                          }
                        >
                          Ligne {event.line_number} · {event.machine_id}
                        </button>
                        <span className="muted">{formatEventActor(event)}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
