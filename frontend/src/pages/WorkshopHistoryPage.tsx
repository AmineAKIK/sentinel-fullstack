import { useEffect, useRef, useState } from 'react';
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
import WorkshopNavBar from '../components/WorkshopNavBar';
import { ProductionLine, WorkshopHistoryEvent, WorkshopIncident, WorkshopIncidentEvent } from '../types';
import {
  EVENT_LABELS,
  formatDateTime,
  formatEventActor,
  formatEventDetail,
  STATE_LABELS,
  STATUS_LABELS,
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

type HistoryStatusFilter = 'all' | 'OPEN' | 'PENDING' | 'CLOSED' | 'CANCELED';

function readHistoryStatusFilter(value: string | null): HistoryStatusFilter {
  return value === 'OPEN' || value === 'PENDING' || value === 'CLOSED' || value === 'CANCELED' ? value : 'all';
}

export default function WorkshopHistoryPage() {
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
  const incidentDetailRef = useRef<HTMLDivElement | null>(null);

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
          return incidentData.some((incident) => String(incident.id) === currentId)
            ? currentId
            : String(incidentData[0].id);
        });
      })
      .catch(() => setError('Impossible de charger l’historique atelier.'))
      .finally(() => setLoading(false));
  }, [query, statusFilter, stateFilter, lineFilter, machineFilter]);

  useEffect(() => {
    const requestedIncidentId = searchParams.get('incident');
    if (!requestedIncidentId) return;
    if (incidents.some((incident) => String(incident.id) === requestedIncidentId)) {
      setSelectedId(requestedIncidentId);
      return;
    }

    const parsedId = Number(requestedIncidentId);
    if (!Number.isInteger(parsedId) || parsedId <= 0) return;
    getWorkshopHistoryIncident(parsedId)
      .then((incident) => {
        setIncidents((current) => current.some((item) => item.id === incident.id) ? current : [incident, ...current]);
        setSelectedId(String(incident.id));
      })
      .catch(() => setError('Impossible de charger l’incident demandé.'));
  }, [searchParams, incidents]);

  useEffect(() => {
    const params = buildIncidentWorkspaceParams({
      query,
      statusFilter,
      stateFilter,
      lineFilter,
      machineFilter,
      eventTypeFilter,
      limit: 80,
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

  const selectedIncident = incidents.find((incident) => String(incident.id) === selectedId);
  const eventTypeOptions = Object.entries(EVENT_LABELS);
  const filterChips: FilterChip[] = [
    ...searchFilterChip(query, () => {
      setQuery('');
      updateSearchFilter('q', '', '');
    }),
    ...(statusFilter !== 'all' ? [{
      key: 'status',
      label: `Statut: ${STATUS_LABELS[statusFilter] || statusFilter}`,
      onRemove: () => {
        setStatusFilter('all');
        updateSearchFilter('status', 'all');
      },
    }] : []),
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
  const eventFilterChips: FilterChip[] = [
    ...(eventTypeFilter !== 'all' ? [{
      key: 'event',
      label: `Action: ${EVENT_LABELS[eventTypeFilter] || eventTypeFilter}`,
      onRemove: () => {
        setEventTypeFilter('all');
        updateSearchFilter('event', 'all');
      },
    }] : []),
  ];

  function selectIncident(id: number, eventId?: number): void {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('incident', String(id));
    setSearchParams(nextParams);
    setSelectedId(String(id));
    if (eventId) setHighlightedEventId(eventId);
    window.setTimeout(() => {
      incidentDetailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }

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

  function durationLabel(startIso?: string, endIso?: string): string {
    if (!startIso || !endIso) return '-';
    const diffMs = new Date(endIso).getTime() - new Date(startIso).getTime();
    if (diffMs <= 0) return '-';
    const minutes = Math.round(diffMs / 60000);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 48) return `${hours} h`;
    return `${Math.round(hours / 24)} j`;
  }

  const selectedHasKnowledge = Boolean(
    selectedIncident?.status === 'CLOSED' && selectedIncident.intervention_note
  );

  return (
    <>
      <WorkshopNavBar />
      <main className="page-container workshop-page">
        <button className="back-link" onClick={() => navigate('/workshop/dashboard')}>
          Retour au dashboard
        </button>

        <div className="page-header">
          <h1>Historique atelier</h1>
        </div>

        {error && <ErrorBanner style={{ marginBottom: 16 }}>{error}</ErrorBanner>}

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-body">
            <div className="history-grid">
              <div className="form-group">
                <label className="form-label">Recherche</label>
                <input
                  className="form-input"
                  placeholder="Incident, machine, acteur, commentaire..."
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    updateSearchFilter('q', event.target.value, '');
                  }}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Statut</label>
                <select
                  className="form-select"
                  value={statusFilter}
                  onChange={(event) => {
                    const value = readHistoryStatusFilter(event.target.value);
                    setStatusFilter(value);
                    updateSearchFilter('status', value);
                  }}
                >
                  <option value="all">Tous</option>
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Ligne</label>
                <select
                  className="form-select"
                  value={lineFilter}
                  onChange={(event) => updateLineFilter(event.target.value)}
                >
                  <option value="all">Toutes</option>
                  {lines.map((line) => (
                    <option key={line.id} value={line.id}>{line.line_number}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Machine</label>
                <select
                  className="form-select"
                  value={machineFilter}
                  onChange={(event) => {
                    setMachineFilter(event.target.value);
                    updateSearchFilter('machine', event.target.value);
                  }}
                  disabled={lineFilter === 'all'}
                >
                  <option value="all">Toutes</option>
                  {machineOptions.map((machine) => (
                    <option key={machine.id} value={machine.id}>{machine.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Type d'anomalie</label>
                <select
                  className="form-select"
                  value={stateFilter}
                  onChange={(event) => {
                    setStateFilter(event.target.value);
                    updateSearchFilter('state', event.target.value);
                  }}
                >
                  <option value="all">Tous</option>
                  {Object.entries(STATE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
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

        <div className="history-layout">
          <div className="card">
            <div className="card-body">
              <div className="detail-field">
                <span className="detail-field-label">Incidents tracés</span>
                <strong>{loading ? '...' : incidents.length}</strong>
              </div>
              <div className="history-incident-list">
                {loading ? (
                  <EmptyState>Chargement...</EmptyState>
                ) : incidents.length === 0 ? (
                  <EmptyState>Aucun incident.</EmptyState>
                ) : (
                  incidents.map((incident) => (
                    <button
                      key={incident.id}
                      type="button"
                      className={`history-incident-item ${String(incident.id) === selectedId ? 'active' : ''}`}
                      onClick={() => selectIncident(incident.id)}
                    >
                      <span className="history-incident-title">Ligne {incident.line_number} · {incident.machine_id}</span>
                      <span className="history-incident-pills">
                        <span className="status-pill">{STATUS_LABELS[incident.status] || incident.status}</span>
                        {incident.status === 'CLOSED' && incident.intervention_note && <span className="status-pill status-pill-soft">Connaissance</span>}
                      </span>
                      <span className="history-incident-meta">
                        {STATE_LABELS[incident.state] || incident.state} · {incident.robot_label} · Tête {incident.head_number}
                      </span>
                      <span className="history-incident-meta">Dernière action {formatDateTime(incident.updated_at)}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="card" ref={incidentDetailRef}>
            <div className="card-body">
              {selectedIncident ? (
                <>
                  <div className="history-timeline-header">
                    <div>
                      <span className="detail-field-label">Trace complète</span>
                      <h2>Ligne {selectedIncident.line_number} · {selectedIncident.machine_id}</h2>
                    </div>
                    <div className="history-header-actions">
                      {selectedHasKnowledge && (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => navigate(`/workshop/knowledge?incident=${selectedIncident.id}`)}
                        >
                          Voir la fiche connaissance
                        </button>
                      )}
                      <span className="status-pill">{STATUS_LABELS[selectedIncident.status] || selectedIncident.status}</span>
                    </div>
                  </div>

                  <div className="history-dossier-summary">
                    <div>
                      <span className="detail-field-label">Équipement</span>
                      <strong>{selectedIncident.robot_label} · Tête {selectedIncident.head_number}</strong>
                      <p>{STATE_LABELS[selectedIncident.state] || selectedIncident.state}</p>
                    </div>
                    <div>
                      <span className="detail-field-label">Créateur</span>
                      <strong>{selectedIncident.first_name} {selectedIncident.last_name}</strong>
                      <p>{selectedIncident.role}</p>
                    </div>
                    <div>
                      <span className="detail-field-label">Traitement</span>
                      <strong>
                        {selectedIncident.taken_by_first_name
                          ? `${selectedIncident.taken_by_first_name} ${selectedIncident.taken_by_last_name || ''}`.trim()
                          : 'Non pris'}
                      </strong>
                      <p>{selectedIncident.taken_by_role || '-'}</p>
                    </div>
                    <div>
                      <span className="detail-field-label">Durée dossier</span>
                      <strong>{durationLabel(selectedIncident.created_at, selectedIncident.updated_at)}</strong>
                      <p>Créé le {formatDateTime(selectedIncident.created_at)}</p>
                    </div>
                  </div>

                  <div className="history-decision-card">
                    <span className="detail-field-label">Lecture du dossier</span>
                    <p>
                      {selectedIncident.status === 'CLOSED'
                        ? 'Cas clôturé et conservé dans l’historique opérationnel.'
                        : selectedIncident.status === 'CANCELED'
                          ? 'Signalement annulé : conservé dans le journal, exclu de la connaissance et des statistiques stratégiques.'
                          : selectedIncident.status === 'PENDING'
                            ? 'Cas en attente : le traitement doit être repris ou justifié avant clôture.'
                            : 'Cas ouvert : le dossier reste en cours dans la file opérationnelle.'}
                    </p>
                  </div>

                  {eventsLoading ? (
                    <EmptyState>Chargement de la trace...</EmptyState>
                  ) : events.length === 0 ? (
                    <EmptyState>Aucune trace pour cet incident.</EmptyState>
                  ) : (
                    <div className="timeline-list">
                      {events.map((event) => {
                        const detail = formatEventDetail(event);
                        return (
                          <div key={event.id} className={`timeline-item ${highlightedEventId === event.id ? 'is-highlighted' : ''}`}>
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
                <EmptyState>Sélectionnez un incident.</EmptyState>
              )}
            </div>
          </div>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-body">
            <div className="history-timeline-header">
              <div>
                <span className="detail-field-label">Journal global</span>
                <h2>Actions récentes dans le périmètre filtré</h2>
              </div>
              <span className="muted">{historyEventsLoading ? 'Chargement...' : `${historyEvents.length} action(s)`}</span>
            </div>
            <div className="history-event-filter">
              <div className="form-group">
                <label className="form-label">Type d’action</label>
                <select
                  className="form-select"
                  value={eventTypeFilter}
                  onChange={(event) => {
                    setEventTypeFilter(event.target.value);
                    updateSearchFilter('event', event.target.value);
                  }}
                >
                  <option value="all">Toutes les actions</option>
                  {eventTypeOptions.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <FilterSummary
                count={historyEvents.length}
                countLabel="action(s) affichée(s)"
                chips={eventFilterChips}
                onClear={clearEventFilters}
                emptyText="Toutes les actions du périmètre"
              />
            </div>
            <div className="table-wrapper">
              <table className="change-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Action</th>
                    <th>Incident</th>
                    <th>Acteur</th>
                  </tr>
                </thead>
                <tbody>
                  {historyEventsLoading ? (
                    <tr><td colSpan={4} className="empty-state">Chargement...</td></tr>
                  ) : historyEvents.length === 0 ? (
                    <tr><td colSpan={4} className="empty-state">Aucune action.</td></tr>
                  ) : (
                    historyEvents.map((event) => {
                      const detail = formatEventDetail(event);
                      return (
                        <tr key={event.id} className={highlightedEventId === event.id ? 'is-selected-row' : ''}>
                          <td>{formatDateTime(event.created_at)}</td>
                          <td>
                            {EVENT_LABELS[event.event_type] || event.event_type}
                            {detail ? <div className="muted">{detail}</div> : null}
                          </td>
                          <td>
                            <button type="button" className="inline-link-button" onClick={() => selectIncident(event.incident_id, event.id)}>
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
          </div>
        </div>
      </main>
    </>
  );
}
