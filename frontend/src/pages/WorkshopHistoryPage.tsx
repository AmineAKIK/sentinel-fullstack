import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  getWorkshopHistoryIncident,
  listIncidentEvents,
  listWorkshopHistoryEvents,
  listWorkshopHistoryIncidents,
  listWorkshopLines,
} from '../api/workshop';
import FilterSummary, { FilterChip } from '../components/FilterSummary';
import EmptyState from '../components/ui/EmptyState';
import ErrorBanner from '../components/ui/ErrorBanner';
import SelectField from '../components/ui/SelectField';
import WorkshopNavBar from '../components/WorkshopNavBar';
import { ProductionLine, WorkshopHistoryEvent, WorkshopIncident, WorkshopIncidentEvent } from '../types';
import { ROLE_LABELS, SHIFT_LABELS, STATE_LABELS, STATUS_LABELS } from '../utils/labels';
import {
  EVENT_LABELS,
  formatDateTime,
  formatEventActor,
  formatEventDetail,
} from '../utils/workshopHistory';
import {
  buildIncidentWorkspaceParams,
  getWorkshopMachineOptions,
  lineFilterChip,
  machineFilterChip,
  searchFilterChip,
  stateFilterChip,
  withWorkshopLineFilter,
  withWorkshopUrlFilter,
} from '../utils/workshopFilters';
import { formatIncidentDuration } from '../utils/durationFormat';
import { usePageTitle } from '../hooks/usePageTitle';

const HISTORY_EVENTS_LIMIT = 80;

type HistoryStatusFilter = 'all' | 'OPEN' | 'PENDING' | 'CLOSED' | 'CANCELED' | 'INVALIDATED';

function readHistoryStatusFilter(value: string | null): HistoryStatusFilter {
  return value === 'OPEN' || value === 'PENDING' || value === 'CLOSED' ||
    value === 'CANCELED' || value === 'INVALIDATED'
    ? value
    : 'all';
}

const TEXT_COLLAPSE_THRESHOLD = 300;

type IncidentTextSectionProps = {
  label: string;
  value: string | null | undefined;
  primary?: boolean;
};

function IncidentTextSection({ label, value, primary }: IncidentTextSectionProps) {
  const [expanded, setExpanded] = useState(false);
  if (!value) return null;
  const isTruncatable = value.length > TEXT_COLLAPSE_THRESHOLD;
  const displayValue = isTruncatable && !expanded ? value.slice(0, TEXT_COLLAPSE_THRESHOLD) + '…' : value;
  return (
    <div className={`history-text-section${primary ? ' history-text-section-primary' : ''}`}>
      <span className="detail-field-label">{label}</span>
      <p>{displayValue}</p>
      {isTruncatable && (
        <button type="button" className="history-text-expand" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Réduire' : 'Voir tout'}
        </button>
      )}
    </div>
  );
}

export default function WorkshopHistoryPage() {
  usePageTitle('Historique');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [incidents, setIncidents] = useState<WorkshopIncident[]>([]);
  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [events, setEvents] = useState<WorkshopIncidentEvent[]>([]);
  const [historyEvents, setHistoryEvents] = useState<WorkshopHistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [historyEventsLoading, setHistoryEventsLoading] = useState(true);
  const [highlightedEventId, setHighlightedEventId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [statusFilter, setStatusFilter] = useState<HistoryStatusFilter>(readHistoryStatusFilter(searchParams.get('status')));
  const [lineFilter, setLineFilter] = useState(searchParams.get('line') || 'all');
  const [machineFilter, setMachineFilter] = useState(searchParams.get('machine') || 'all');
  const [stateFilter, setStateFilter] = useState(searchParams.get('state') || 'all');
  const [eventTypeFilter, setEventTypeFilter] = useState(searchParams.get('event') || 'all');

  type SortCol = 'date' | 'action' | 'incident' | 'actor';
  type SortDir = 'asc' | 'desc';
  const [sortCol, setSortCol] = useState<SortCol>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const incidentDetailRef = useRef<HTMLDivElement | null>(null);
  const activeItemRef = useRef<HTMLButtonElement | null>(null);
  const isMobileRef = useRef(false);

  useEffect(() => {
    isMobileRef.current = window.matchMedia('(max-width: 820px)').matches;
  }, []);

  // Scrolle la carte active en vue dans la liste dès que selectedId change
  useEffect(() => {
    if (!selectedId) return;
    window.setTimeout(() => {
      activeItemRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 80);
  }, [selectedId]);

  useEffect(() => {
    listWorkshopLines()
      .then(setLines)
      .catch(() => setError('Impossible de charger les référentiels atelier.'));
  }, []);

  useEffect(() => {
    const params = buildIncidentWorkspaceParams({
      query,
      statusFilter,
      stateFilter,
      lineFilter,
      machineFilter,
      limit: 250,
    });

    setLoading(true);
    setError('');
    listWorkshopHistoryIncidents(params)
      .then((incidentData) => {
        setIncidents(incidentData);
        setSelectedId((currentId) => {
          if (incidentData.length === 0) return '';
          return incidentData.some((inc) => String(inc.id) === currentId)
            ? currentId
            : String(incidentData[0].id);
        });
      })
      .catch(() => setError("Impossible de charger l'historique atelier."))
      .finally(() => setLoading(false));
  }, [query, statusFilter, stateFilter, lineFilter, machineFilter]);

  // Charge un incident ciblé par URL (?incident=N) hors des résultats filtrés.
  // Dépend volontairement de searchParams uniquement — les incidents déjà chargés
  // sont lus via un setter fonctionnel pour éviter de créer une boucle de dépendances.
  useEffect(() => {
    const requestedId = searchParams.get('incident');
    if (!requestedId) return;

    setIncidents((current) => {
      if (current.some((inc) => String(inc.id) === requestedId)) {
        setSelectedId(requestedId);
        return current;
      }
      const parsedId = Number(requestedId);
      if (!Number.isInteger(parsedId) || parsedId <= 0) return current;

      getWorkshopHistoryIncident(parsedId)
        .then((incident) => {
          setIncidents((prev) =>
            prev.some((i) => i.id === incident.id) ? prev : [incident, ...prev]
          );
          setSelectedId(String(incident.id));
        })
        .catch(() => setError("Impossible de charger l'incident demandé."));

      return current;
    });
  }, [searchParams]);

  useEffect(() => {
    const params = buildIncidentWorkspaceParams({
      query,
      statusFilter,
      stateFilter,
      lineFilter,
      machineFilter,
      eventTypeFilter,
      limit: HISTORY_EVENTS_LIMIT,
    });

    setHistoryEventsLoading(true);
    listWorkshopHistoryEvents(params)
      .then(setHistoryEvents)
      .catch(() => setHistoryEvents([]))
      .finally(() => setHistoryEventsLoading(false));
  }, [query, statusFilter, stateFilter, lineFilter, machineFilter, eventTypeFilter]);

  useEffect(() => {
    if (!selectedId) {
      setEvents([]);
      return;
    }
    setEventsLoading(true);
    listIncidentEvents(Number(selectedId))
      .then(setEvents)
      .catch(() => setEvents([]))
      .finally(() => setEventsLoading(false));
  }, [selectedId]);

  const machineOptions = getWorkshopMachineOptions(lines, lineFilter);
  const selectedIncident = incidents.find((inc) => String(inc.id) === selectedId);

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

  const filterChips: FilterChip[] = [
    ...searchFilterChip(query, () => {
      setQuery('');
      updateSearchFilter('q', '', '');
    }),
    ...(statusFilter !== 'all' ? [{
      key: 'status',
      label: `Statut: ${STATUS_LABELS[statusFilter] || statusFilter}`,
      onRemove: () => { setStatusFilter('all'); updateSearchFilter('status', 'all'); },
    }] : []),
    ...lineFilterChip(lines, lineFilter, () => updateLineFilter('all')),
    ...machineFilterChip(machineFilter, () => { setMachineFilter('all'); updateSearchFilter('machine', 'all'); }),
    ...stateFilterChip(stateFilter, () => { setStateFilter('all'); updateSearchFilter('state', 'all'); }),
  ];

  const eventFilterChips: FilterChip[] = [
    ...(eventTypeFilter !== 'all' ? [{
      key: 'event',
      label: `Action: ${EVENT_LABELS[eventTypeFilter] || eventTypeFilter}`,
      onRemove: () => { setEventTypeFilter('all'); updateSearchFilter('event', 'all'); },
    }] : []),
  ];

  function selectIncident(id: number, eventId?: number): void {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('incident', String(id));
    setSearchParams(nextParams);
    setSelectedId(String(id));
    setHighlightedEventId(eventId ?? null);
    if (isMobileRef.current) {
      window.setTimeout(() => {
        incidentDetailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
    }
  }

  // À l'arrivée depuis une URL externe (ex: page connaissance), scrolle vers le détail
  const isInitialDeepLink = useRef(!!searchParams.get('incident'));
  useEffect(() => {
    if (!isInitialDeepLink.current || !selectedId) return;
    isInitialDeepLink.current = false;
    window.setTimeout(() => {
      incidentDetailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 200);
  }, [selectedId]);

  function updateSearchFilter(name: string, value: string, fallback = 'all'): void {
    setSearchParams(withWorkshopUrlFilter(searchParams, name, value, fallback));
  }

  function updateLineFilter(value: string): void {
    setLineFilter(value);
    setMachineFilter('all');
    setSearchParams(withWorkshopLineFilter(searchParams, value));
  }

  function clearFilters(): void {
    setQuery('');
    setStatusFilter('all');
    setLineFilter('all');
    setMachineFilter('all');
    setStateFilter('all');
    const nextParams = new URLSearchParams();
    if (selectedId) nextParams.set('incident', selectedId);
    if (eventTypeFilter !== 'all') nextParams.set('event', eventTypeFilter);
    setSearchParams(nextParams);
  }

  function clearEventFilters(): void {
    setEventTypeFilter('all');
    updateSearchFilter('event', 'all');
  }

  const selectedHasKnowledge =
    selectedIncident?.status === 'CLOSED' && Boolean(selectedIncident.intervention_note);

  function handleSort(col: SortCol): void {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir(col === 'date' ? 'desc' : 'asc');
    }
  }

  const sortedEvents = useMemo(() => {
    const copy = [...historyEvents];
    const dir = sortDir === 'asc' ? 1 : -1;
    copy.sort((a, b) => {
      switch (sortCol) {
        case 'date':
          return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        case 'action':
          return dir * (EVENT_LABELS[a.event_type] || a.event_type).localeCompare(EVENT_LABELS[b.event_type] || b.event_type, 'fr');
        case 'incident':
          return dir * (`${a.line_number}${a.machine_id}`).localeCompare(`${b.line_number}${b.machine_id}`, 'fr');
        case 'actor':
          return dir * formatEventActor(a).localeCompare(formatEventActor(b), 'fr');
        default:
          return 0;
      }
    });
    return copy;
  }, [historyEvents, sortCol, sortDir]);

  return (
    <>
      <WorkshopNavBar />
      <main id="main-content" className="page-container workshop-page">
        <button className="back-link" onClick={() => navigate('/workshop/dashboard')}>
          Retour au dashboard
        </button>

        <div className="page-header">
          <h1>Historique atelier</h1>
        </div>

        {error && <ErrorBanner style={{ marginBottom: 16 }}>{error}</ErrorBanner>}

        {/* ── Filtres ─────────────────────────────────────────────── */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-body">
            <div className="history-grid">
              <div className="form-group">
                <label className="form-label">Recherche</label>
                <input
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
                <label className="form-label">Statut</label>
                <SelectField
                  value={statusFilter}
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
                <label className="form-label">Ligne</label>
                <SelectField
                  value={lineFilter}
                  onChange={updateLineFilter}
                  options={[
                    { value: 'all', label: 'Toutes' },
                    ...lines.map((l) => ({ value: String(l.id), label: l.line_number })),
                  ]}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Machine</label>
                <SelectField
                  value={machineFilter}
                  onChange={(v) => { setMachineFilter(v); updateSearchFilter('machine', v); }}
                  disabled={lineFilter === 'all'}
                  options={[
                    { value: 'all', label: 'Toutes' },
                    ...machineOptions.map((m) => ({ value: m.id, label: m.label })),
                  ]}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Type d'anomalie</label>
                <SelectField
                  value={stateFilter}
                  onChange={(v) => { setStateFilter(v); updateSearchFilter('state', v); }}
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

        {/* ── Layout list + détail ─────────────────────────────────── */}
        <div className="history-layout">

          {/* Liste */}
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
                    const duration = formatIncidentDuration(inc.created_at, inc.updated_at, inc.status);
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
                          <span className="status-pill">{STATUS_LABELS[inc.status] || inc.status}</span>
                          {inc.status === 'CLOSED' && inc.intervention_note && (
                            <span className="status-pill status-pill-soft">Connaissance</span>
                          )}
                          {inc.is_priority && (
                            <span className="status-pill history-pill-urgent">Urgent</span>
                          )}
                        </span>
                        <span className="history-incident-meta">
                          {STATE_LABELS[inc.state] || inc.state} · {inc.robot_label} · Tête {inc.head_number}
                        </span>
                        <span className="history-incident-footer">
                          <span className="history-incident-meta">{formatDateTime(inc.updated_at)}</span>
                          {duration !== '—' && (
                            <span className={`history-incident-duration${inc.status !== 'CLOSED' ? ' history-incident-duration-active' : ''}`}>
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

          {/* Détail */}
          <div className="card" ref={incidentDetailRef}>
            <div className="card-body">
              {selectedIncident ? (
                <>
                  <div className="history-timeline-header">
                    <div className="history-timeline-header-top">
                      <div>
                        <span className="detail-field-label">Dossier incident</span>
                        <h2>Ligne {selectedIncident.line_number} · {selectedIncident.machine_id}</h2>
                      </div>
                      <span className="status-pill">{STATUS_LABELS[selectedIncident.status] || selectedIncident.status}</span>
                    </div>
                    {selectedHasKnowledge && (
                      <button
                        type="button"
                        className="btn btn-secondary history-knowledge-btn"
                        onClick={() => navigate(`/workshop/knowledge?incident=${selectedIncident.id}`)}
                      >
                        Voir la fiche connaissance
                      </button>
                    )}
                  </div>

                  {/* Contexte */}
                  <div className="history-dossier-summary">
                    <div>
                      <span className="detail-field-label">Équipement</span>
                      <strong>{selectedIncident.robot_label} · Tête {selectedIncident.head_number}</strong>
                      <p>{STATE_LABELS[selectedIncident.state] || selectedIncident.state}</p>
                    </div>
                    <div>
                      <span className="detail-field-label">Poste · Produit</span>
                      <strong>{SHIFT_LABELS[selectedIncident.shift] || selectedIncident.shift}</strong>
                      <p>{selectedIncident.current_product || 'Produit non renseigné'}</p>
                    </div>
                    <div>
                      <span className="detail-field-label">Déclarant</span>
                      <strong>{selectedIncident.first_name} {selectedIncident.last_name}</strong>
                      <p>{ROLE_LABELS[selectedIncident.role] || selectedIncident.role}</p>
                    </div>
                    <div>
                      <span className="detail-field-label">Technicien</span>
                      <strong>
                        {selectedIncident.taken_by_first_name
                          ? `${selectedIncident.taken_by_first_name} ${selectedIncident.taken_by_last_name || ''}`.trim()
                          : 'Non pris en charge'}
                      </strong>
                      <p>
                        {selectedIncident.taken_by_role
                          ? ROLE_LABELS[selectedIncident.taken_by_role] || selectedIncident.taken_by_role
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <span className="detail-field-label">Durée dossier</span>
                      <strong>{formatIncidentDuration(selectedIncident.created_at, selectedIncident.updated_at, selectedIncident.status)}</strong>
                      <p>Créé le {formatDateTime(selectedIncident.created_at)}</p>
                    </div>
                  </div>

                  {/* Textes métier */}
                  <div className="history-texts">
                    <IncidentTextSection
                      label="Commentaire opérateur"
                      value={selectedIncident.comment}
                    />
                    <IncidentTextSection
                      label="Diagnostic"
                      value={selectedIncident.diagnostic}
                    />
                    <IncidentTextSection
                      label="Note d'intervention"
                      value={selectedIncident.intervention_note}
                      primary
                    />
                    <IncidentTextSection
                      label="Consigne responsable"
                      value={selectedIncident.responsible_comment}
                    />
                  </div>

                  {/* Timeline */}
                  <div className="history-trace-header">
                    <span className="detail-field-label">Trace complète</span>
                  </div>
                  {eventsLoading ? (
                    <EmptyState>Chargement de la trace…</EmptyState>
                  ) : events.length === 0 ? (
                    <EmptyState>Aucune trace pour cet incident.</EmptyState>
                  ) : (
                    <div className="timeline-list">
                      {events.map((event) => {
                        const detail = formatEventDetail(event);
                        return (
                          <div
                            key={event.id}
                            className={`timeline-item${highlightedEventId === event.id ? ' is-highlighted' : ''}`}
                          >
                            <div className="timeline-date">{formatDateTime(event.created_at)}</div>
                            <div className="timeline-content">
                              <strong>{EVENT_LABELS[event.event_type] || event.event_type}</strong>
                              {detail && <span>{detail}</span>}
                              <span className="muted">{formatEventActor(event)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <EmptyState>Sélectionnez un incident pour consulter son dossier.</EmptyState>
              )}
            </div>
          </div>
        </div>

        {/* ── Journal global ───────────────────────────────────────── */}
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
                onChange={(e) => { setEventTypeFilter(e.target.value); updateSearchFilter('event', e.target.value); }}
              >
                <option value="all">Toutes les actions</option>
                {EVENT_FILTER_OPTIONS.map((key) => (
                  <option key={key} value={key}>{EVENT_LABELS[key]}</option>
                ))}
              </select>
              {eventTypeFilter !== 'all' && (
                <button
                  type="button"
                  className="filter-chip"
                  onClick={() => { setEventTypeFilter('all'); updateSearchFilter('event', 'all'); }}
                  aria-label="Retirer le filtre action"
                >
                  <span>Action : {EVENT_LABELS[eventTypeFilter] || eventTypeFilter}</span>
                  <span aria-hidden="true">×</span>
                </button>
              )}
              <span className="history-event-count muted">
                {historyEventsLoading ? 'Chargement…' : `${historyEvents.length} action(s)`}
              </span>
              {!historyEventsLoading && historyEvents.length >= HISTORY_EVENTS_LIMIT && (
                <span className="history-limit-notice">
                  Limite de {HISTORY_EVENTS_LIMIT} — affinez les filtres.
                </span>
              )}
            </div>

            {/* Tableau desktop */}
            <div className="table-wrapper history-journal-table">
              <table className="change-table">
                <thead>
                  <tr>
                    {(['date', 'action', 'incident', 'actor'] as SortCol[]).map((col) => {
                      const labels: Record<SortCol, string> = { date: 'Date', action: 'Action', incident: 'Incident', actor: 'Acteur' };
                      const active = sortCol === col;
                      return (
                        <th key={col}>
                          <button
                            type="button"
                            className={`sort-th-btn${active ? ' sort-th-active' : ''}`}
                            onClick={() => handleSort(col)}
                            aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
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
                    <tr><td colSpan={4} className="empty-state">Chargement…</td></tr>
                  ) : sortedEvents.length === 0 ? (
                    <tr><td colSpan={4} className="empty-state">Aucune action.</td></tr>
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
                            {EVENT_LABELS[event.event_type] || event.event_type}
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
                            <div className="muted">{STATUS_LABELS[event.status] || event.status}</div>
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
                        <strong>{EVENT_LABELS[event.event_type] || event.event_type}</strong>
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
