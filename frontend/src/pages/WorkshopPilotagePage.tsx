import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getWorkshopAnalytics, listWorkshopLines } from '../api/workshop';
import FilterSummary, { FilterChip } from '../components/FilterSummary';
import EmptyState from '../components/ui/EmptyState';
import ErrorBanner from '../components/ui/ErrorBanner';
import KpiCard from '../components/ui/KpiCard';
import WorkshopNavBar from '../components/WorkshopNavBar';
import { ProductionLine, WorkshopAnalytics } from '../types';
import { formatShortDate } from '../utils/date';
import { getWorkshopMachineOptions, lineFilterChip, machineFilterChip } from '../utils/workshopFilters';
import { buildAnalyticsParams, formatSeconds, HistoryPeriod, STATE_LABELS } from '../utils/workshopHistory';

export default function WorkshopPilotagePage() {
  const navigate = useNavigate();
  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [analytics, setAnalytics] = useState<WorkshopAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState<HistoryPeriod>('7d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [lineFilter, setLineFilter] = useState('all');
  const [machineFilter, setMachineFilter] = useState('all');

  useEffect(() => {
    listWorkshopLines()
      .then(setLines)
      .catch(() => setError('Impossible de charger les référentiels atelier.'));
  }, []);

  useEffect(() => {
    if (period === 'custom' && customStart && customEnd && customStart > customEnd) {
      setError('La date de début doit être antérieure à la date de fin.');
      return;
    }
    setLoading(true);
    setError('');
    getWorkshopAnalytics(buildAnalyticsParams(period, customStart, customEnd, lineFilter, machineFilter))
      .then(setAnalytics)
      .catch(() => {
        setAnalytics(null);
        setError('Impossible de charger les indicateurs.');
      })
      .finally(() => setLoading(false));
  }, [period, customStart, customEnd, lineFilter, machineFilter]);

  const machineOptions = getWorkshopMachineOptions(lines, lineFilter);

  const trendSummary = useMemo(() => {
    const trend = analytics?.trend || [];
    const created = trend.reduce((sum, item) => sum + item.created, 0);
    const closed = trend.reduce((sum, item) => sum + item.closed, 0);
    const priority = trend.reduce((sum, item) => sum + item.priority, 0);
    const last = trend[trend.length - 1];
    const previous = trend[trend.length - 2];
    return {
      created,
      closed,
      priority,
      lastCreated: last?.created ?? 0,
      previousCreated: previous?.created ?? 0,
    };
  }, [analytics]);

  const trendMaxValue = useMemo(() => {
    return Math.max(...(analytics?.trend || []).map((item) => Math.max(item.created, item.closed, 1)), 1);
  }, [analytics]);

  const activeLoad = analytics?.active ?? ((analytics?.open || 0) + (analytics?.pending || 0));
  const closureRate = analytics && analytics.total > 0 ? Math.round((analytics.closed / analytics.total) * 100) : 0;
  const priorityShare = analytics && analytics.total > 0 ? Math.round((analytics.priority / analytics.total) * 100) : 0;
  const urgentNotTaken = analytics?.urgent_not_taken ?? 0;
  const backlogDelta = trendSummary.created - trendSummary.closed;
  const loadStatus = analytics && (urgentNotTaken > 0 || analytics.open_over_7d > 0)
    ? 'Sous tension'
    : activeLoad > 0
      ? 'À surveiller'
      : 'Stable';
  const mainLine = analytics?.by_line?.[0];
  const mainMachine = analytics?.by_machine?.[0];
  const mainState = analytics?.by_state?.[0];
  const filterChips: FilterChip[] = [
    ...(period !== '7d' ? [{
      key: 'period',
      label: `Période: ${period === 'today' ? "Aujourd'hui" : period === '30d' ? '30 jours' : period === 'lifetime' ? 'Tout' : 'Personnalisée'}`,
      onRemove: () => {
        setPeriod('7d');
        setCustomStart('');
        setCustomEnd('');
      },
    }] : []),
    ...(period === 'custom' && customStart ? [{
      key: 'start',
      label: `Début: ${customStart}`,
      onRemove: () => setCustomStart(''),
    }] : []),
    ...(period === 'custom' && customEnd ? [{
      key: 'end',
      label: `Fin: ${customEnd}`,
      onRemove: () => setCustomEnd(''),
    }] : []),
    ...lineFilterChip(lines, lineFilter, () => {
      setLineFilter('all');
      setMachineFilter('all');
    }),
    ...machineFilterChip(machineFilter, () => setMachineFilter('all')),
  ];
  const summaryText = analytics
    ? `Le recensement montre ${trendSummary.created} création(s), ${trendSummary.closed} clôture(s) et ${activeLoad} cas encore actif(s). L’analyse classe la situation "${loadStatus.toLowerCase()}" avec ${urgentNotTaken} urgence(s) non prise(s), ${priorityShare}% d’urgences et une tension principale sur ${mainLine ? `la ligne ${mainLine.line_number}` : 'aucune ligne dominante'}${mainMachine ? `, machine ${mainMachine.machine_id}` : ''}.`
    : '';

  function renderBarList(items: { label: string; count: number }[]) {
    if (items.length === 0) return <EmptyState>Aucune donnée sur cette période.</EmptyState>;
    return (
      <div className="bar-list">
        {items.map((item) => (
          <div key={item.label} className="bar-row">
            <div className="bar-label">{item.label}</div>
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{ width: analytics && analytics.total > 0 ? `${(item.count / analytics.total) * 100}%` : '0%' }}
              />
            </div>
            <div className="bar-count">{item.count}</div>
          </div>
        ))}
      </div>
    );
  }

  function renderComparisonBars(items: { label: string; count: number; tone?: 'blue' | 'green' | 'red' }[]) {
    const maxCount = Math.max(...items.map((item) => item.count), 1);
    if (items.length === 0) return <EmptyState>Aucune donnée sur cette période.</EmptyState>;
    return (
      <div className="comparison-list">
        {items.map((item) => (
          <div key={item.label} className="comparison-row">
            <div className="comparison-label">{item.label}</div>
            <div className="comparison-track">
              <span
                className={`comparison-fill comparison-fill-${item.tone || 'blue'}`}
                style={{ width: `${Math.max((item.count / maxCount) * 100, item.count > 0 ? 6 : 0)}%` }}
              />
            </div>
            <div className="comparison-count">{item.count}</div>
          </div>
        ))}
      </div>
    );
  }

  function formatTrendDate(value: string): string {
    return formatShortDate(value);
  }

  function clearFilters(): void {
    setPeriod('7d');
    setCustomStart('');
    setCustomEnd('');
    setLineFilter('all');
    setMachineFilter('all');
  }

  return (
    <>
      <WorkshopNavBar />
      <main id="main-content" className="page-container workshop-page">
        <button className="back-link" onClick={() => navigate('/workshop/dashboard')}>
          Retour au dashboard
        </button>

        <div className="page-header">
          <h1>Pilotage atelier</h1>
        </div>

        {error && <ErrorBanner style={{ marginBottom: 16 }}>{error}</ErrorBanner>}

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-body">
            <div className="history-grid">
              <div className="form-group">
                <label className="form-label">Période</label>
                <select className="form-select" value={period} onChange={(event) => setPeriod(event.target.value as HistoryPeriod)}>
                  <option value="today">Aujourd'hui</option>
                  <option value="7d">7 derniers jours</option>
                  <option value="30d">30 derniers jours</option>
                  <option value="lifetime">Tout l'historique</option>
                  <option value="custom">Personnalisée</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Début</label>
                <input type="date" className="form-input" value={customStart} onChange={(event) => setCustomStart(event.target.value)} disabled={period !== 'custom'} />
              </div>
              <div className="form-group">
                <label className="form-label">Fin</label>
                <input type="date" className="form-input" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} disabled={period !== 'custom'} />
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
                    <option key={line.id} value={line.id}>{line.line_number}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Machine</label>
                <select className="form-select" value={machineFilter} onChange={(event) => setMachineFilter(event.target.value)} disabled={lineFilter === 'all'}>
                  <option value="all">Toutes</option>
                  {machineOptions.map((machine) => (
                    <option key={machine.id} value={machine.id}>{machine.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <FilterSummary
              count={analytics?.total ?? 0}
              countLabel="signalement(s) dans le périmètre"
              chips={filterChips}
              onClear={clearFilters}
              emptyText="Périmètre par défaut"
              className="filter-summary-embedded"
            />
          </div>
        </div>

        <section className="pilotage-section">
          <div className="pilotage-section-header">
            <div>
              <span className="detail-field-label">Temps réel</span>
              <h2>Situation actuelle à surveiller</h2>
            </div>
          </div>

          <div className="kpi-grid pilotage-live-grid">
            <KpiCard label="Cas actifs" value={loading ? '...' : activeLoad} sub="Ouverts + en attente" />
            <KpiCard label="Non pris" value={loading ? '...' : analytics?.not_taken ?? 0} sub="À affecter rapidement" />
            <KpiCard label="Urgences non prises" value={loading ? '...' : urgentNotTaken} sub="Risque immédiat" />
            <KpiCard
              label="Plus vieux actif"
              value={loading ? '...' : formatSeconds(analytics?.oldest_active_seconds ?? null)}
              sub="Ancienneté maximale en cours"
            />
            <KpiCard
              label="Délai médian prise en charge"
              value={loading ? '...' : formatSeconds(analytics?.median_take_seconds ?? null)}
              sub="Médiane du temps avant prise en charge"
            />
          </div>

          <div className="pilotage-split-grid">
            <div className="card">
              <div className="card-body">
                <div className="chart-title">File active</div>
                {renderComparisonBars([
                  { label: 'Ouverts', count: analytics?.open || 0, tone: 'blue' },
                  { label: 'En attente', count: analytics?.pending || 0, tone: 'red' },
                  { label: 'Non pris', count: analytics?.not_taken || 0, tone: 'red' },
                  { label: 'Urgences non prises', count: urgentNotTaken, tone: 'red' },
                ])}
              </div>
            </div>
            <div className="card">
              <div className="card-body">
                <div className="chart-title">Lignes actives</div>
                {renderBarList((analytics?.by_line || []).slice(0, 6).map((item) => ({ label: item.line_number, count: item.count })))}
              </div>
            </div>
            <div className="card">
              <div className="card-body">
                <div className="chart-title">Vieillissement actif</div>
                {renderComparisonBars([
                  { label: '> 24 h', count: analytics?.open_over_24h || 0, tone: 'blue' },
                  { label: '> 7 j', count: analytics?.open_over_7d || 0, tone: 'red' },
                ])}
              </div>
            </div>
          </div>
        </section>

        <section className="pilotage-section">
          <div className="pilotage-section-header">
            <div>
              <span className="detail-field-label">Recensement</span>
              <h2>Faits constatés sur la période</h2>
            </div>
            <span className="muted">Période sélectionnée</span>
          </div>

          <div className="pilotage-insight-grid">
            <KpiCard label="Signalements créés" value={loading ? '...' : trendSummary.created} sub="Hors annulations invalidées" />
            <KpiCard label="Cas clôturés" value={loading ? '...' : analytics?.closed ?? 0} sub="Clôtures constatées" />
            <KpiCard label="Urgences créées" value={loading ? '...' : trendSummary.priority} sub="Signalements passés en priorité" />
          </div>

          <div className="pilotage-insight-grid">
            <KpiCard
              label="Anomalie dominante"
              value={loading ? '...' : mainState ? STATE_LABELS[mainState.state] || mainState.state : '-'}
              sub={mainState ? `${mainState.count} signalement(s)` : 'Aucune anomalie dominante'}
              valueClassName="kpi-value-small"
            />
            <KpiCard
              label="Ligne la plus exposée"
              value={loading ? '...' : mainLine ? mainLine.line_number : '-'}
              sub={mainLine ? `${mainLine.count} signalement(s)` : 'Aucune ligne dominante'}
            />
            <KpiCard
              label="Machine récurrente"
              value={loading ? '...' : mainMachine ? mainMachine.machine_id : '-'}
              sub={mainMachine ? `${mainMachine.count} signalement(s)` : 'Aucune machine dominante'}
              valueClassName="kpi-value-small"
            />
          </div>
        </section>

        <div className="pilotage-report-grid">
          <div className="card pilotage-trend-card">
            <div className="card-body">
              <div className="chart-title">Tendance quotidienne</div>
              {(analytics?.trend || []).length === 0 ? (
                <EmptyState>Aucune donnée sur cette période.</EmptyState>
              ) : (
                <div className="trend-list">
                  {(analytics?.trend || []).map((item) => {
                    return (
                      <div key={item.day} className="trend-row">
                        <div className="trend-date">{formatTrendDate(item.day)}</div>
                        <div className="trend-bars">
                          <span
                            className="trend-bar trend-bar-created"
                            style={{ width: `${Math.max((item.created / trendMaxValue) * 100, item.created > 0 ? 6 : 0)}%` }}
                          />
                          <span
                            className="trend-bar trend-bar-closed"
                            style={{ width: `${Math.max((item.closed / trendMaxValue) * 100, item.closed > 0 ? 6 : 0)}%` }}
                          />
                        </div>
                        <div className="trend-counts">
                          <span>{item.created}</span>
                          <span>{item.closed}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="trend-legend">
                <span><i className="trend-dot-created" /> Créés</span>
                <span><i className="trend-dot-closed" /> Clôturés</span>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-body">
              <div className="chart-title">Types d'anomalies</div>
              {renderComparisonBars((analytics?.by_state || []).map((item) => ({
                label: STATE_LABELS[item.state] || item.state,
                count: item.count,
                tone: 'blue',
              })))}
            </div>
          </div>
          <div className="card">
            <div className="card-body">
              <div className="chart-title">Priorité</div>
              {renderComparisonBars([
                { label: 'Urgent', count: analytics?.priority || 0, tone: 'red' },
                { label: 'Normal', count: Math.max((analytics?.total || 0) - (analytics?.priority || 0), 0), tone: 'green' },
              ])}
            </div>
          </div>
        </div>

        <section className="pilotage-section">
          <div className="pilotage-section-header">
            <div>
              <span className="detail-field-label">Analyse & bilan</span>
              <h2>Lecture exploitable en réunion</h2>
            </div>
          </div>

          <div className="pilotage-summary-card">
              <span className="detail-field-label">Lecture rapide</span>
              <p>{loading ? 'Chargement du bilan...' : summaryText}</p>
              <div className="pilotage-summary-facts">
                <span>Situation: {loadStatus}</span>
                <span>Taux de clôture {closureRate}%</span>
                <span>Urgences {priorityShare}%</span>
                <span>{analytics?.open_over_24h || 0} cas actif(s) &gt; 24 h</span>
              </div>
            </div>

          <div className="pilotage-insight-grid">
            <KpiCard label="Charge résiduelle" value={loading ? '...' : activeLoad} sub="Cas encore ouverts ou en attente" />
            <KpiCard
              label="Variation de charge"
              value={loading ? '...' : backlogDelta > 0 ? `+${backlogDelta}` : backlogDelta}
              sub="Créations moins clôtures"
            />
            <KpiCard
              label="Traitement médian"
              value={loading ? '...' : formatSeconds(analytics?.median_close_seconds ?? null)}
              sub={<>Moyenne: {loading ? '...' : formatSeconds(analytics?.avg_close_seconds ?? null)}</>}
            />
          </div>
        </section>
      </main>
    </>
  );
}
