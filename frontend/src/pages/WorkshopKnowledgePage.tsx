import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  getWorkshopKnowledgeIncident,
  listWorkshopKnowledgeIncidents,
  listWorkshopLines,
} from '../api/workshop';
import FilterSummary, { FilterChip } from '../components/FilterSummary';
import EmptyState from '../components/ui/EmptyState';
import ErrorBanner from '../components/ui/ErrorBanner';
import KpiCard from '../components/ui/KpiCard';
import WorkshopNavBar from '../components/WorkshopNavBar';
import { ProductionLine, WorkshopIncident } from '../types';
import { formatDateTime, STATE_LABELS } from '../utils/workshopHistory';
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

export default function WorkshopKnowledgePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [incidents, setIncidents] = useState<WorkshopIncident[]>([]);
  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [lineFilter, setLineFilter] = useState(searchParams.get('line') || 'all');
  const [machineFilter, setMachineFilter] = useState(searchParams.get('machine') || 'all');
  const [stateFilter, setStateFilter] = useState(searchParams.get('state') || 'all');
  const [selectedId, setSelectedId] = useState('');

  useEffect(() => {
    listWorkshopLines()
      .then(setLines)
      .catch(() => setError('Impossible de charger les référentiels atelier.'));
  }, []);

  useEffect(() => {
    const params = buildIncidentWorkspaceParams({
      query,
      stateFilter,
      lineFilter,
      machineFilter,
      limit: 300,
    });

    setLoading(true);
    setError('');
    listWorkshopKnowledgeIncidents(params)
      .then((incidentData) => {
        setIncidents(incidentData);
        setSelectedId((currentId) => {
          if (incidentData.length === 0) return '';
          return incidentData.some((incident) => String(incident.id) === currentId)
            ? currentId
            : String(incidentData[0].id);
        });
      })
      .catch(() => setError('Impossible de charger la base de connaissance.'))
      .finally(() => setLoading(false));
  }, [query, stateFilter, lineFilter, machineFilter]);

  useEffect(() => {
    const requestedIncidentId = searchParams.get('incident');
    if (!requestedIncidentId) return;
    if (incidents.some((incident) => String(incident.id) === requestedIncidentId)) {
      setSelectedId(requestedIncidentId);
      return;
    }

    const parsedId = Number(requestedIncidentId);
    if (!Number.isInteger(parsedId) || parsedId <= 0) return;
    getWorkshopKnowledgeIncident(parsedId)
      .then((incident) => {
        setIncidents((current) => current.some((item) => item.id === incident.id) ? current : [incident, ...current]);
        setSelectedId(String(incident.id));
      })
      .catch(() => setError('Cette fiche connaissance n’est pas disponible.'));
  }, [searchParams, incidents]);

  const machineOptions = getWorkshopMachineOptions(lines, lineFilter);

  const machineCount = new Set(incidents.map((incident) => incident.machine_id)).size;
  const lastItem = incidents[0];
  const selectedIncident = incidents.find((incident) => String(incident.id) === selectedId);
  const filterChips: FilterChip[] = [
    ...searchFilterChip(query, () => {
      setQuery('');
      updateSearchFilter('q', '', '');
    }),
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

  function selectKnowledgeIncident(id: number): void {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('incident', String(id));
    setSearchParams(nextParams);
    setSelectedId(String(id));
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
    setLineFilter('all');
    setMachineFilter('all');
    setStateFilter('all');
    const nextParams = new URLSearchParams();
    if (selectedId) nextParams.set('incident', selectedId);
    setSearchParams(nextParams);
  }

  return (
    <>
      <WorkshopNavBar />
      <main id="main-content" className="page-container workshop-page">
        <button className="back-link" onClick={() => navigate('/workshop/dashboard')}>
          Retour au dashboard
        </button>

        <div className="page-header">
          <h1>Base de connaissance</h1>
        </div>

        {error && <ErrorBanner style={{ marginBottom: 16 }}>{error}</ErrorBanner>}

        <div className="kpi-grid">
          <KpiCard label="Cas exploitables" value={loading ? '...' : incidents.length} />
          <KpiCard label="Machines concernées" value={loading ? '...' : machineCount} />
          <KpiCard
            label="Dernière fiche"
            value={lastItem ? formatDateTime(lastItem.updated_at) : '-'}
            valueClassName="kpi-value-small"
          />
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-body">
            <div className="history-grid">
              <div className="form-group">
                <label className="form-label">Recherche</label>
                <input
                  className="form-input"
                  placeholder="Symptôme, solution, machine, produit..."
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    updateSearchFilter('q', event.target.value, '');
                  }}
                />
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
              countLabel="fiche(s) affichée(s)"
              chips={filterChips}
              onClear={clearFilters}
              emptyText="Base complète"
              className="filter-summary-embedded"
            />
          </div>
        </div>

        <div className="knowledge-layout">
          <div className="card">
            <div className="card-body">
              <div className="detail-field">
                <span className="detail-field-label">Fiches disponibles</span>
                <strong>{loading ? '...' : incidents.length}</strong>
              </div>
              <div className="knowledge-card-list">
                {loading ? (
                  <EmptyState>Chargement...</EmptyState>
                ) : incidents.length === 0 ? (
                  <EmptyState>Aucune fiche exploitable.</EmptyState>
                ) : (
                  incidents.map((incident) => (
                    <button
                      key={incident.id}
                      type="button"
                      className={`knowledge-card-item ${String(incident.id) === selectedId ? 'active' : ''}`}
                      onClick={() => selectKnowledgeIncident(incident.id)}
                    >
                      <span className="knowledge-card-title">Ligne {incident.line_number} · {incident.machine_id}</span>
                      <span className="knowledge-card-context">
                        {incident.robot_label} · Tête {incident.head_number} · {STATE_LABELS[incident.state] || incident.state}
                      </span>
                      <span className="knowledge-card-preview">{incident.comment || incident.diagnostic || incident.intervention_note}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              {selectedIncident ? (
                <article className="knowledge-detail">
                  <div className="knowledge-detail-header">
                    <div>
                      <span className="detail-field-label">Fiche intervention</span>
                      <h2>Ligne {selectedIncident.line_number} · {selectedIncident.machine_id}</h2>
                    </div>
                    <span className="status-pill">{STATE_LABELS[selectedIncident.state] || selectedIncident.state}</span>
                  </div>

                  <div className="knowledge-meta-grid">
                    <div>
                      <span className="detail-field-label">Équipement</span>
                      <strong>{selectedIncident.robot_label} · Tête {selectedIncident.head_number}</strong>
                      <p>{selectedIncident.machine_brand}</p>
                    </div>
                    <div>
                      <span className="detail-field-label">Produit</span>
                      <strong>{selectedIncident.current_product || '-'}</strong>
                    </div>
                    <div>
                      <span className="detail-field-label">Clôture</span>
                      <strong>{formatDateTime(selectedIncident.updated_at)}</strong>
                    </div>
                  </div>

                  <div className="knowledge-section">
                    <span className="detail-field-label">Symptôme observé</span>
                    <p>{selectedIncident.comment || '-'}</p>
                  </div>
                  <div className="knowledge-section">
                    <span className="detail-field-label">Diagnostic</span>
                    <p>{selectedIncident.diagnostic || '-'}</p>
                  </div>
                  <div className="knowledge-section knowledge-section-primary">
                    <span className="detail-field-label">Solution / intervention validée</span>
                    <p>{selectedIncident.intervention_note || '-'}</p>
                  </div>
                  {selectedIncident.responsible_comment && (
                    <div className="knowledge-section">
                      <span className="detail-field-label">Consigne responsable</span>
                      <p>{selectedIncident.responsible_comment}</p>
                    </div>
                  )}
                  <div className="knowledge-actions">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => navigate(`/workshop/history?incident=${selectedIncident.id}`)}
                    >
                      Voir la trace historique
                    </button>
                  </div>
                </article>
              ) : (
                <EmptyState>Sélectionnez une fiche.</EmptyState>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
