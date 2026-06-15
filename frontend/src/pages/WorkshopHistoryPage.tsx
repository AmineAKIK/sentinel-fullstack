import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import FilterSummary, { FilterChip } from '../components/FilterSummary';
import EmptyState from '../components/ui/EmptyState';
import ErrorBanner from '../components/ui/ErrorBanner';
import SelectField from '../components/ui/SelectField';
import WorkshopNavBar from '../components/WorkshopNavBar';
import IncidentDossier from '../components/IncidentDossier';
import { STATUS_LABELS, STATE_LABELS } from '../utils/labels';
import { EVENT_LABELS, formatDateTime, formatEventActor, formatEventDetail } from '../utils/workshopHistory';
import {
  getWorkshopMachineOptions,
  lineFilterChip,
  machineFilterChip,
  searchFilterChip,
  stateFilterChip,
} from '../utils/workshopFilters';
import { formatIncidentDuration } from '../utils/durationFormat';
import { usePageTitle } from '../hooks/usePageTitle';
import { useHistoryData, readHistoryStatusFilter, SortCol } from '../hooks/useHistoryData';

const EVENT_FILTER_OPTIONS = [
  'INCIDENT_CREATED',
  'INCIDENT_TAKEN',
  'INCIDENT_SET_PENDING',
  'INCIDENT_RESUMED',
  'INCIDENT_CLOSED',
  'INCIDENT_CANCELED',
  'INCIDENT_INVALIDATED',
  'PRIORITY_CHANGED',
  'RESPONSIBLE_COMMENT_UPDATED',
] as const;

export default function WorkshopHistoryPage() {
  usePageTitle('Historique');
  const navigate = useNavigate();
  const isInitialDeepLinkRef = useRef(false);

  const {
    incidents,
    lines,
    selectedId,
    selectedIncident,
    events,
    historyEvents,
    sortedEvents,
    loading,
    eventsLoading,
    historyEventsLoading,
    highlightedEventId,
    error,
    query,
    statusFilter,
    lineFilter,
    machineFilter,
    stateFilter,
    eventTypeFilter,
    sortCol,
    sortDir,
    incidentDetailRef,
    activeItemRef,
    historyEventsLimit,
    setQuery,
    setStatusFilter,
    setMachineFilter,
    setStateFilter,
    setEventTypeFilter,
    updateSearchFilter,
    updateLineFilter,
    selectIncident,
    clearFilters,
    handleSort,
  } = useHistoryData();

  void isInitialDeepLinkRef;

  const machineOptions = getWorkshopMachineOptions(lines, lineFilter);

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
          <h1>Historique atelier</h1>
        </div>

        {error && <ErrorBanner style={{ marginBottom: 16 }}>{error}</ErrorBanner>}

        {/* Filtres */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-body">
            <div className="history-grid">
              <div className="form-group">
                <label className="form-label" htmlFor="history-search">Recherche</label>
                <input
                  id="history-search"
                  className="form-input"
                  placeholder="Incident, machine, acteur, commentaire…"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    updateSearchFilter('q', e.target.value, '');
                  }}
                />
              </div>
              <div className="form-group">
                <label className="form-label" aria-hidden="true">Statut</label>
                <SelectField
                  value={statusFilter}
                  ariaLabel="Statut"
                  onChange={(v) => {
                    const value = readHistoryStatusFilter(v);
                    setStatusFilter(value);
                    updateSearchFilter('status', value);
                  }}
                  options={[
                    { value: 'all', label: 'Tous' },
                    ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
                  ]}
                />
              </div>
              <div className="form-group">
                <label className="form-label" aria-hidden="true">Ligne</label>
                <SelectField
                  value={lineFilter}
                  ariaLabel="Ligne"
                  onChange={updateLineFilter}
                  options={[
                    { value: 'all', label: 'Toutes' },
                    ...lines.map((l) => ({ value: String(l.id), label: l.line_number })),
                  ]}
                />
              </div>
              <div className="form-group">
                <label className="form-label" aria-hidden="true">Machine</label>
                <SelectField
                  value={machineFilter}
                  ariaLabel="Machine"
                  onChange={(v) => {
                    setMachineFilter(v);
                    updateSearchFilter('machine', v);
                  }}
                  disabled={lineFilter === 'all'}
                  options={[
                    { value: 'all', label: 'Toutes' },
                    ...machineOptions.map((m) => ({ value: m.id, label: m.label })),
                  ]}
                />
              </div>
              <div className="form-group">
                <label className="form-label" aria-hidden="true">Type d'anomalie</label>
                <SelectField
                  value={stateFilter}
                  ariaLabel="Type d'anomalie"
                  onChange={(v) => {
                    setStateFilter(v);
                    updateSearchFilter('state', v);
                  }}
                  options={[
                    { value: 'all', label: 'Tous' },
                    ...Object.entries(STATE_LABELS).map(([value, label]) => ({ value, label })),
                  ]}
                />
              </div>
            </div>
            <FilterSummary
              count={incidents.length}
              countLabel="incident(s) affiché(s)"
              chips={filterChips}
              onClear={clearFilters}
              emptyText="Historique complet"
              className="filter-summary-embedded"
            />
          </div>
        </div>

        {/* Layout liste + détail */}
        <div className="history-layout">
          <div className="card">
            <div className="card-body">
              <div className="detail-field" style={{ marginBottom: 10 }}>
                <span className="detail-field-label">Incidents tracés</span>
                <strong>{loading ? '…' : incidents.length}</strong>
              </div>
              <div className="history-incident-list">
                {loading ? (
                  <EmptyState>Chargement…</EmptyState>
                ) : incidents.length === 0 ? (
                  <EmptyState>Aucun incident.</EmptyState>
                ) : (
                  incidents.map((inc) => {
                    const duration = formatIncidentDuration(
                      inc.created_at,
                      inc.updated_at,
                      inc.status
                    );
                    return (
                      <button
                        key={inc.id}
                        ref={String(inc.id) === selectedId ? activeItemRef : undefined}
                        type="button"
                        className={`history-incident-item${String(inc.id) === selectedId ? ' active' : ''}`}
                        onClick={() => selectIncident(inc.id)}
                      >
                        <span className="history-incident-title">
                          Ligne {inc.line_number} · {inc.machine_id}
                        </span>
                        <span className="history-incident-pills">
                          <span className="status-pill">
                            {STATUS_LABELS[inc.status] ?? inc.status}
                          </span>
                          {inc.status === 'CLOSED' && inc.intervention_note && (
                            <span className="status-pill status-pill-soft">Connaissance</span>
                          )}
                          {inc.is_priority && (
                            <span className="status-pill history-pill-urgent">Urgent</span>
                          )}
                        </span>
                        <span className="history-incident-meta">
                          {STATE_LABELS[inc.state] ?? inc.state} · {inc.robot_label} · Tête{' '}
                          {inc.head_number}
                        </span>
                        <span className="history-incident-footer">
                          <span className="history-incident-meta">
                            {formatDateTime(inc.updated_at)}
                          </span>
                          {duration !== '—' && (
                            <span
                              className={`history-incident-duration${inc.status !== 'CLOSED' ? ' history-incident-duration-active' : ''}`}
                            >
                              {duration}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div className="card" ref={incidentDetailRef}>
            <div className="card-body">
              {selectedIncident ? (
                <IncidentDossier
                  incident={selectedIncident}
                  events={events}
                  eventsLoading={eventsLoading}
                  highlightedEventId={highlightedEventId}
                />
              ) : (
                <EmptyState>Sélectionnez un incident pour consulter son dossier.</EmptyState>
              )}
            </div>
          </div>
        </div>

        {/* Journal global */}
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-body">
            <div className="history-timeline-header">
              <div>
                <span className="detail-field-label">Journal global</span>
                <h2>Actions récentes dans le périmètre filtré</h2>
              </div>
            </div>

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
              <table className="change-table">
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
                          aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
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
                        <tr
                          key={event.id}
                          className={highlightedEventId === event.id ? 'is-selected-row' : ''}
                        >
                          <td>{formatDateTime(event.created_at)}</td>
                          <td>
                            {EVENT_LABELS[event.event_type] ?? event.event_type}
                            {detail && <div className="muted">{detail}</div>}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="inline-link-button"
                              onClick={() => selectIncident(event.incident_id, event.id)}
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
                    <div
                      key={event.id}
                      className={`history-journal-card${highlightedEventId === event.id ? ' is-highlighted' : ''}`}
                    >
                      <div className="history-journal-card-top">
                        <strong>{EVENT_LABELS[event.event_type] ?? event.event_type}</strong>
                        <span className="muted">{formatDateTime(event.created_at)}</span>
                      </div>
                      {detail && <span className="muted">{detail}</span>}
                      <div className="history-journal-card-bottom">
                        <button
                          type="button"
                          className="inline-link-button"
                          onClick={() => selectIncident(event.incident_id, event.id)}
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
