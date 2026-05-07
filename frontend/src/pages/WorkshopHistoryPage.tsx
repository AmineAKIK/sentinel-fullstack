import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getWorkshopAnalytics, listIncidentEvents, listWorkshopIncidents, listWorkshopLines } from '../api/workshop';
import { ProductionLine, WorkshopAnalytics, WorkshopIncident, WorkshopIncidentEvent } from '../types';

const EVENT_LABELS: Record<string, string> = {
  INCIDENT_CREATED: 'Signalement cree',
  EDIT_REQUESTED: 'Modification demandee',
  EDIT_APPLIED: 'Modification appliquee',
  EDIT_REJECTED: 'Modification refusee',
  DELETE_REQUESTED: 'Suppression demandee',
  DELETE_REQUEST_REJECTED: 'Suppression refusee',
  INCIDENT_TAKEN: 'Prise en charge',
  STATUS_CHANGED: 'Changement de statut',
  PRIORITY_CHANGED: 'Priorite modifiee',
  ORDER_CHANGED: 'Reordonnancement',
  RESPONSIBLE_COMMENT_UPDATED: 'Consigne responsable',
  INCIDENT_UPDATED: 'Incident modifie',
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatEventActor(event: WorkshopIncidentEvent): string {
  if (!event.first_name) return 'Systeme';
  const fullName = `${event.first_name} ${event.last_name || ''}`.trim();
  return event.badge_number ? `${fullName} (${event.badge_number})` : fullName;
}

function formatEventDetail(event: WorkshopIncidentEvent): string {
  if (!event.payload) return '';
  const payload = event.payload as Record<string, unknown>;
  if (event.event_type === 'STATUS_CHANGED' && payload.from && payload.to) {
    return `${payload.from} -> ${payload.to}`;
  }
  if (event.event_type === 'PRIORITY_CHANGED' && payload.value !== undefined) {
    return payload.value ? 'Urgent' : 'Normal';
  }
  return '';
}

export default function WorkshopHistoryPage() {
  const navigate = useNavigate();
  const [incidents, setIncidents] = useState<WorkshopIncident[]>([]);
  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [events, setEvents] = useState<WorkshopIncidentEvent[]>([]);
  const [analytics, setAnalytics] = useState<WorkshopAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState<'lifetime' | '7d' | 'custom'>('lifetime');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [lineFilter, setLineFilter] = useState('all');
  const [machineFilter, setMachineFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'OPEN' | 'PENDING' | 'CLOSED'>('all');
  const [stateFilter, setStateFilter] = useState('all');

  useEffect(() => {
    setLoading(true);
    Promise.all([listWorkshopIncidents(), listWorkshopLines()])
      .then(([incidentData, lineData]) => {
        setIncidents(incidentData);
        setLines(lineData);
        if (incidentData.length > 0) setSelectedId(String(incidentData[0].id));
      })
      .catch(() => setError('Impossible de charger les incidents.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const params: { start?: string; end?: string; lineId?: number; machineId?: string } = {};
    if (period === '7d') {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - 7);
      params.start = startDate.toISOString();
      params.end = endDate.toISOString();
    }
    if (period === 'custom') {
      if (customStart) params.start = new Date(customStart).toISOString();
      if (customEnd) {
        const endDate = new Date(customEnd);
        endDate.setHours(23, 59, 59, 999);
        params.end = endDate.toISOString();
      }
    }
    if (lineFilter !== 'all') params.lineId = Number(lineFilter);
    if (machineFilter !== 'all') params.machineId = machineFilter;

    setAnalyticsLoading(true);
    getWorkshopAnalytics(params)
      .then(setAnalytics)
      .catch(() => setAnalytics(null))
      .finally(() => setAnalyticsLoading(false));
  }, [period, customStart, customEnd, lineFilter, machineFilter]);

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

  const machineOptions = useMemo(() => {
    const line = lines.find((item) => String(item.id) === lineFilter);
    if (!line) return [];
    return line.machines.map((machine) => ({ id: machine.machineId, label: machine.machineId }));
  }, [lineFilter, lines]);

  const filteredKnowledgeBase = useMemo(() => {
    return incidents.filter((incident) => {
      if (statusFilter !== 'all' && incident.status !== statusFilter) return false;
      if (stateFilter !== 'all' && incident.state !== stateFilter) return false;
      if (lineFilter !== 'all' && String(incident.line_id) !== lineFilter) return false;
      if (machineFilter !== 'all' && incident.machine_id !== machineFilter) return false;
      if (!query.trim()) return true;
      const q = query.trim().toLowerCase();
      const haystack = [
        incident.comment,
        incident.diagnostic,
        incident.intervention_note,
        incident.responsible_comment,
        incident.machine_id,
        incident.line_number,
        incident.robot_label,
        incident.current_product,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [incidents, statusFilter, stateFilter, lineFilter, machineFilter, query]);

  const donutData = useMemo(() => {
    const byState = analytics?.by_state || [];
    const total = byState.reduce((sum, item) => sum + item.count, 0) || 1;
    const colors = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#0ea5e9'];
    let acc = 0;
    const segments = byState.map((item, index) => {
      const start = (acc / total) * 100;
      acc += item.count;
      const end = (acc / total) * 100;
      return `${colors[index % colors.length]} ${start}% ${end}%`;
    });
    return {
      gradient: `conic-gradient(${segments.join(', ')})`,
      legend: byState.map((item, index) => ({
        label: item.state,
        count: item.count,
        color: colors[index % colors.length],
      })),
      total: analytics?.total || 0,
    };
  }, [analytics]);

  const priorityDonut = useMemo(() => {
    const total = analytics?.total || 0;
    const priority = analytics?.priority || 0;
    const normal = Math.max(total - priority, 0);
    const safeTotal = total || 1;
    const priorityPct = (priority / safeTotal) * 100;
    const normalPct = 100 - priorityPct;
    return {
      gradient: `conic-gradient(#dc2626 0% ${priorityPct}%, #16a34a ${priorityPct}% 100%)`,
      legend: [
        { label: 'Urgent', count: priority, color: '#dc2626' },
        { label: 'Normal', count: normal, color: '#16a34a' },
      ],
    };
  }, [analytics]);

  function formatSeconds(value: number | null): string {
    if (!value || value <= 0) return '—';
    const minutes = Math.round(value / 60);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.round(minutes / 60);
    return `${hours} h`;
  }

  return (
    <main className="page-container">
      <button className="back-link" onClick={() => navigate('/workshop/dashboard')}>
        ← Retour au dashboard
      </button>

      <div className="page-header">
        <h1>Historique & base de connaissance</h1>
      </div>

      {error && <div className="error-message" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body">
          <div className="history-grid">
            <div className="form-group">
              <label className="form-label">Periode</label>
              <select
                className="form-select"
                value={period}
                onChange={(event) => setPeriod(event.target.value as typeof period)}
              >
                <option value="lifetime">Lifetime</option>
                <option value="7d">7 derniers jours</option>
                <option value="custom">Personnalisee</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Debut</label>
              <input
                type="date"
                className="form-input"
                value={customStart}
                onChange={(event) => setCustomStart(event.target.value)}
                disabled={period !== 'custom'}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Fin</label>
              <input
                type="date"
                className="form-input"
                value={customEnd}
                onChange={(event) => setCustomEnd(event.target.value)}
                disabled={period !== 'custom'}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Ligne</label>
              <select
                className="form-select"
                value={lineFilter}
                onChange={(event) => {
                  setLineFilter(event.target.value);
                  setMachineFilter('all');
                }}
              >
                <option value="all">Toutes</option>
                {lines.map((line) => (
                  <option key={line.id} value={line.id}>
                    {line.line_number}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Machine</label>
              <select
                className="form-select"
                value={machineFilter}
                onChange={(event) => setMachineFilter(event.target.value)}
                disabled={lineFilter === 'all'}
              >
                <option value="all">Toutes</option>
                {machineOptions.map((machine) => (
                  <option key={machine.id} value={machine.id}>
                    {machine.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="card">
          <div className="card-body">
            <div className="kpi-label">Total anomalies</div>
            <div className="kpi-value">{analyticsLoading ? '...' : analytics?.total ?? 0}</div>
          </div>
        </div>
        <div className="card">
          <div className="card-body">
            <div className="kpi-label">Ouverts</div>
            <div className="kpi-value">{analyticsLoading ? '...' : analytics?.open ?? 0}</div>
          </div>
        </div>
        <div className="card">
          <div className="card-body">
            <div className="kpi-label">En attente</div>
            <div className="kpi-value">{analyticsLoading ? '...' : analytics?.pending ?? 0}</div>
          </div>
        </div>
        <div className="card">
          <div className="card-body">
            <div className="kpi-label">Clotures</div>
            <div className="kpi-value">{analyticsLoading ? '...' : analytics?.closed ?? 0}</div>
          </div>
        </div>
        <div className="card">
          <div className="card-body">
            <div className="kpi-label">Prise en charge mediane</div>
            <div className="kpi-value">{analyticsLoading ? '...' : formatSeconds(analytics?.median_take_seconds ?? null)}</div>
            <div className="kpi-sub">Moyenne: {analyticsLoading ? '...' : formatSeconds(analytics?.avg_take_seconds ?? null)}</div>
          </div>
        </div>
        <div className="card">
          <div className="card-body">
            <div className="kpi-label">Temps de cloture median</div>
            <div className="kpi-value">{analyticsLoading ? '...' : formatSeconds(analytics?.median_close_seconds ?? null)}</div>
            <div className="kpi-sub">Moyenne: {analyticsLoading ? '...' : formatSeconds(analytics?.avg_close_seconds ?? null)}</div>
          </div>
        </div>
      </div>

      <div className="history-charts">
        <div className="card">
          <div className="card-body">
            <div className="chart-title">Types d'anomalies</div>
            <div className="donut-row">
              <div className="donut" style={{ background: donutData.gradient }} />
              <div className="legend">
                {donutData.legend.map((item) => (
                  <div key={item.label} className="legend-item">
                    <span className="legend-dot" style={{ backgroundColor: item.color }} />
                    <span>{item.label}</span>
                    <span className="legend-count">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-body">
            <div className="chart-title">Priorite</div>
            <div className="donut-row">
              <div className="donut" style={{ background: priorityDonut.gradient }} />
              <div className="legend">
                {priorityDonut.legend.map((item) => (
                  <div key={item.label} className="legend-item">
                    <span className="legend-dot" style={{ backgroundColor: item.color }} />
                    <span>{item.label}</span>
                    <span className="legend-count">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-body">
            <div className="chart-title">Top lignes</div>
            <div className="bar-list">
              {(analytics?.by_line || []).map((item) => (
                <div key={item.line_number} className="bar-row">
                  <div className="bar-label">{item.line_number}</div>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{
                        width: analytics && analytics.total > 0
                          ? `${(item.count / analytics.total) * 100}%`
                          : '0%'
                      }}
                    />
                  </div>
                  <div className="bar-count">{item.count}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-body">
            <div className="chart-title">Top machines</div>
            <div className="bar-list">
              {(analytics?.by_machine || []).map((item) => (
                <div key={item.machine_id} className="bar-row">
                  <div className="bar-label">{item.machine_id}</div>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{
                        width: analytics && analytics.total > 0
                          ? `${(item.count / analytics.total) * 100}%`
                          : '0%'
                      }}
                    />
                  </div>
                  <div className="bar-count">{item.count}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body">
          <div className="history-grid">
            <div className="form-group">
              <label className="form-label">Recherche</label>
              <input
                className="form-input"
                placeholder="Rechercher un symptome, solution, machine..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Statut</label>
              <select
                className="form-select"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
              >
                <option value="all">Tous</option>
                <option value="OPEN">Ouvert</option>
                <option value="PENDING">En attente</option>
                <option value="CLOSED">Cloture</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Type d'anomalie</label>
              <select
                className="form-select"
                value={stateFilter}
                onChange={(event) => setStateFilter(event.target.value)}
              >
                <option value="all">Tous</option>
                <option value="SKIPEE_PAR_MACHINE">Skipee par machine</option>
                <option value="SKIPEE_PAR_CONDUCTEUR">Skipee par conducteur</option>
                <option value="DEGRADEE">Degradee</option>
                <option value="INDISPONIBLE">Indisponible</option>
                <option value="AUTRE">Autre</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body">
          <div className="detail-field">
            <span className="detail-field-label">Base de connaissance</span>
          </div>
          <div className="table-wrapper">
            <table className="change-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Contexte</th>
                  <th>Symptome</th>
                  <th>Diagnostic</th>
                  <th>Solution / Intervention</th>
                </tr>
              </thead>
              <tbody>
                {filteredKnowledgeBase.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="empty-state">Aucun resultat.</td>
                  </tr>
                ) : (
                  filteredKnowledgeBase.map((incident) => (
                    <tr key={incident.id}>
                      <td>{formatDateTime(incident.created_at)}</td>
                      <td>
                        {incident.line_number} · {incident.machine_id} · {incident.robot_label}
                        <div className="muted">{incident.current_product || 'Produit inconnu'}</div>
                      </td>
                      <td>{incident.comment || '—'}</td>
                      <td>{incident.diagnostic || '—'}</td>
                      <td>{incident.intervention_note || incident.responsible_comment || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body">
          <div className="detail-field">
            <span className="detail-field-label">Historique d'un incident</span>
          </div>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label" htmlFor="historyIncidentSelect">Incident</label>
            <select
              id="historyIncidentSelect"
              className="form-select"
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
              disabled={loading}
            >
              <option value="">-- Selectionner --</option>
              {incidents.map((incident) => (
                <option key={incident.id} value={incident.id}>
                  {incident.line_number} · {incident.machine_id}
                </option>
              ))}
            </select>
          </div>
          {eventsLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
              <span className="spinner" style={{ width: 20, height: 20, borderWidth: 3 }} />
            </div>
          ) : events.length === 0 ? (
            <div className="empty-state">Aucun historique.</div>
          ) : (
            <div className="table-wrapper">
              <table className="change-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Action</th>
                    <th>Acteur</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => {
                    const detail = formatEventDetail(event);
                    return (
                      <tr key={event.id}>
                        <td>{formatDateTime(event.created_at)}</td>
                        <td>
                          {EVENT_LABELS[event.event_type] || event.event_type}
                          {detail ? ` (${detail})` : ''}
                        </td>
                        <td>{formatEventActor(event)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
