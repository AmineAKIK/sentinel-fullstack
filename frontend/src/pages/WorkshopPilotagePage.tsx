import { useNavigate } from 'react-router-dom';
import FilterSummary, { FilterChip } from '../components/FilterSummary';
import EmptyState from '../components/ui/EmptyState';
import ErrorBanner from '../components/ui/ErrorBanner';
import SelectField from '../components/ui/SelectField';
import WorkshopNavBar from '../components/WorkshopNavBar';
import LineHeatmap from '../components/pilotage/LineHeatmap';
import { Sparkline, TrendChart, Ranking } from '../components/pilotage/PilotageCharts';
import { STATE_LABELS } from '../utils/labels';
import {
  getWorkshopMachineOptions,
  lineFilterChip,
  machineFilterChip,
} from '../utils/workshopFilters';
import { HistoryPeriod } from '../utils/workshopHistory';
import { usePageTitle } from '../hooks/usePageTitle';
import { usePilotageData } from '../hooks/usePilotageData';

const STATE_DESCRIPTIONS: Record<string, string> = {
  SKIPEE_PAR_MACHINE: 'Saut machine',
  SKIPEE_PAR_CONDUCTEUR: 'Saut conducteur',
  DEGRADEE: 'Dégradée',
  INDISPONIBLE: 'Indisponible',
};

const PERIOD_LABELS: Record<HistoryPeriod, string> = {
  today: "Aujourd'hui",
  '7d': '7 derniers jours',
  '30d': '30 derniers jours',
  lifetime: "Tout l'historique",
  custom: 'Personnalisée',
};

function formatTime(date: Date): string {
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function signedNumber(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return '—';
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}

export default function WorkshopPilotagePage() {
  usePageTitle('Pilotage atelier');
  const navigate = useNavigate();

  const {
    lines,
    analytics,
    metrics,
    realtimeLoading,
    analyticsLoading,
    error,
    analyticsError,
    lastRefresh,
    period,
    customStart,
    customEnd,
    lineFilter,
    machineFilter,
    rankingLimit,
    activeIncidents,
    urgentNotTaken,
    notTaken,
    oldCases,
    statusTone,
    sparklineData,
    lineStatuses,
    trendSummary,
    setPeriod,
    setCustomStart,
    setCustomEnd,
    setLineFilter,
    setMachineFilter,
    setRankingLimit,
  } = usePilotageData();

  function goToDashboard(params: Record<string, string> = {}) {
    const search = new URLSearchParams(params).toString();
    void navigate(`/workshop/dashboard${search ? `?${search}` : ''}`);
  }

  const machineOptions = getWorkshopMachineOptions(lines, lineFilter);

  const backlogDelta = trendSummary.created - trendSummary.closed;
  const closureRate =
    trendSummary.created > 0
      ? Math.round((trendSummary.closed / trendSummary.created) * 100)
      : 0;
  const hasAnalyticsData = analytics !== null && analytics.total > 0;

  const statusLabel =
    statusTone === 'tension' ? 'Sous tension' : statusTone === 'watch' ? 'À surveiller' : 'Stable';

  const filterChips: FilterChip[] = [
    ...(period !== '7d'
      ? [
          {
            key: 'period',
            label: `Période: ${PERIOD_LABELS[period]}`,
            onRemove: () => {
              setPeriod('7d');
              setCustomStart('');
              setCustomEnd('');
            },
          },
        ]
      : []),
    ...(period === 'custom' && customStart
      ? [{ key: 'start', label: `Début: ${customStart}`, onRemove: () => setCustomStart('') }]
      : []),
    ...(period === 'custom' && customEnd
      ? [{ key: 'end', label: `Fin: ${customEnd}`, onRemove: () => setCustomEnd('') }]
      : []),
    ...lineFilterChip(lines, lineFilter, () => setLineFilter('all')),
    ...machineFilterChip(machineFilter, () => setMachineFilter('all')),
  ];

  function clearFilters() {
    setPeriod('7d');
    setCustomStart('');
    setCustomEnd('');
    setLineFilter('all');
    setMachineFilter('all');
  }

  const rankingItems = {
    lines: (analytics?.by_line ?? []).map((item) => ({
      label: `Ligne ${item.line_number}`,
      count: item.count,
    })),
    machines: (analytics?.by_machine ?? []).map((item) => ({
      label: item.machine_id,
      count: item.count,
    })),
    states: (analytics?.by_state ?? []).map((item) => ({
      label: STATE_LABELS[item.state] ?? item.state,
      count: item.count,
      description: STATE_DESCRIPTIONS[item.state],
    })),
  };

  return (
    <>
      <WorkshopNavBar />
      <main id="main-content" className="page-container workshop-page pilotage-page">
        <button className="back-link" onClick={() => void navigate('/workshop/dashboard')}>
          Retour au dashboard
        </button>

        {error && <ErrorBanner style={{ marginBottom: 12 }}>{error}</ErrorBanner>}

        {/* ZONE 1 — HERO : état global + 4 hero stats */}
        <div className="pilotage-hero">
          <div className="pilotage-hero-title-row">
            <div>
              <h1 className="pilotage-hero-title">Pilotage atelier</h1>
              <div className="pilotage-hero-state">
                <span
                  className={`pilotage-status-dot pilotage-status-dot-${realtimeLoading ? 'stable' : statusTone}`}
                  aria-hidden="true"
                />
                <span className={`pilotage-hero-state-label pilotage-hero-state-${statusTone}`}>
                  {realtimeLoading ? 'Chargement…' : statusLabel}
                </span>
                <span className="muted" style={{ fontSize: '0.78rem' }}>
                  · Temps réel · {formatTime(lastRefresh)}
                </span>
              </div>
            </div>
            {!realtimeLoading && activeIncidents.length > 0 && (
              <button type="button" className="btn btn-outline" onClick={() => goToDashboard()}>
                Ouvrir le dashboard
              </button>
            )}
          </div>

          <div className="sr-only" aria-live="polite" aria-atomic="true">
            {!realtimeLoading &&
              `${urgentNotTaken.length} urgence${urgentNotTaken.length !== 1 ? 's' : ''} non prise${urgentNotTaken.length !== 1 ? 's' : ''}, ${notTaken.length} sans technicien`}
          </div>

          <div className="pilotage-hero-stats">
            <button
              type="button"
              className={`pilotage-hero-stat${activeIncidents.length > 0 ? ' pilotage-hero-stat-watch' : ''}`}
              onClick={activeIncidents.length > 0 ? () => goToDashboard() : undefined}
              disabled={activeIncidents.length === 0}
            >
              <span className="pilotage-hero-stat-label">Incidents actifs</span>
              <div className="pilotage-hero-stat-body">
                <strong className="pilotage-hero-stat-value">
                  {realtimeLoading ? '…' : activeIncidents.length}
                </strong>
                <Sparkline
                  data={sparklineData}
                  tone={activeIncidents.length > 0 ? 'watch' : 'stable'}
                />
              </div>
              <span className="pilotage-hero-stat-sub">
                {metrics ? `${metrics.open} ouverts · ${metrics.pending} en attente` : '—'}
              </span>
            </button>

            <button
              type="button"
              className={`pilotage-hero-stat${urgentNotTaken.length > 0 ? ' pilotage-hero-stat-tension' : ''}`}
              onClick={
                urgentNotTaken.length > 0
                  ? () => goToDashboard({ priority: 'urgent', taken: 'not_taken' })
                  : undefined
              }
              disabled={urgentNotTaken.length === 0}
            >
              <span className="pilotage-hero-stat-label">Urgences non prises</span>
              <div className="pilotage-hero-stat-body">
                <strong className="pilotage-hero-stat-value pilotage-hero-stat-value-critical">
                  {realtimeLoading ? '…' : urgentNotTaken.length}
                </strong>
              </div>
              <span className="pilotage-hero-stat-sub">
                {metrics ? `${metrics.priority} urgents au total` : '—'}
              </span>
            </button>

            <button
              type="button"
              className={`pilotage-hero-stat${notTaken.length > 0 ? ' pilotage-hero-stat-watch' : ''}`}
              onClick={notTaken.length > 0 ? () => goToDashboard({ taken: 'not_taken' }) : undefined}
              disabled={notTaken.length === 0}
            >
              <span className="pilotage-hero-stat-label">Sans technicien</span>
              <div className="pilotage-hero-stat-body">
                <strong className="pilotage-hero-stat-value">
                  {realtimeLoading ? '…' : notTaken.length}
                </strong>
              </div>
              <span className="pilotage-hero-stat-sub">Non pris en charge</span>
            </button>

            <button
              type="button"
              className={`pilotage-hero-stat${oldCases.length > 0 ? ' pilotage-hero-stat-tension' : ''}`}
              onClick={oldCases.length > 0 ? () => goToDashboard({ age: 'over_7d' }) : undefined}
              disabled={oldCases.length === 0}
            >
              <span className="pilotage-hero-stat-label">Incidents &gt; 7 jours</span>
              <div className="pilotage-hero-stat-body">
                <strong className="pilotage-hero-stat-value pilotage-hero-stat-value-critical">
                  {realtimeLoading ? '…' : oldCases.length}
                </strong>
              </div>
              <span className="pilotage-hero-stat-sub">Actifs qui vieillissent</span>
            </button>
          </div>

          {!realtimeLoading &&
            (urgentNotTaken.length > 0 || oldCases.length > 0 || notTaken.length > 0) && (
              <div className="pilotage-hero-actions">
                {urgentNotTaken.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-sm pilotage-decision-action-btn pilotage-decision-action-tension"
                    onClick={() => goToDashboard({ priority: 'urgent', taken: 'not_taken' })}
                  >
                    {urgentNotTaken.length} urgence{urgentNotTaken.length > 1 ? 's' : ''} sans
                    technicien
                  </button>
                )}
                {notTaken.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-sm pilotage-decision-action-btn pilotage-decision-action-watch"
                    onClick={() => goToDashboard({ taken: 'not_taken' })}
                  >
                    {notTaken.length} non pris en charge
                  </button>
                )}
                {oldCases.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-sm pilotage-decision-action-btn pilotage-decision-action-watch"
                    onClick={() => goToDashboard({ age: 'over_7d' })}
                  >
                    {oldCases.length} cas &gt; 7 j
                  </button>
                )}
              </div>
            )}
        </div>

        {/* ZONE 2 — DIAGNOSTIC : heatmap par ligne */}
        <section className="pilotage-section">
          <div className="pilotage-section-header">
            <div>
              <span className="detail-field-label">Diagnostic par ligne</span>
              <h2>État des lignes de production</h2>
            </div>
          </div>
          {realtimeLoading ? (
            <EmptyState>Chargement…</EmptyState>
          ) : (
            <div className="card pilotage-heatmap-card">
              <div className="card-body" style={{ padding: 0 }}>
                <LineHeatmap
                  lineStatuses={lineStatuses}
                  onOpenLine={(id) => goToDashboard({ line: String(id) })}
                />
              </div>
            </div>
          )}
        </section>

        {/* ZONE 3 — ANALYTICS : bilan période */}
        <div className="pilotage-analytics-zone">
          <div className="pilotage-section-header" style={{ marginBottom: 16 }}>
            <div>
              <span className="detail-field-label">Bilan analytique</span>
              <h2>Indicateurs sur la période</h2>
            </div>
          </div>

          {analyticsError && (
            <ErrorBanner style={{ marginBottom: 12 }}>{analyticsError}</ErrorBanner>
          )}

          <div className="card pilotage-filter-card">
            <div className="card-body">
              <div className="history-grid">
                <div className="form-group">
                  <label className="form-label" aria-hidden="true">Période</label>
                  <SelectField
                    value={period}
                    ariaLabel="Période"
                    onChange={(v) => setPeriod(v as HistoryPeriod)}
                    options={[
                      { value: 'today', label: "Aujourd'hui" },
                      { value: '7d', label: '7 derniers jours' },
                      { value: '30d', label: '30 derniers jours' },
                      { value: 'lifetime', label: "Tout l'historique" },
                      { value: 'custom', label: 'Personnalisée' },
                    ]}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="pilotage-date-start">Début</label>
                  <input
                    id="pilotage-date-start"
                    type="date"
                    className="form-input"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    disabled={period !== 'custom'}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="pilotage-date-end">Fin</label>
                  <input
                    id="pilotage-date-end"
                    type="date"
                    className="form-input"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    disabled={period !== 'custom'}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" aria-hidden="true">Ligne</label>
                  <SelectField
                    value={lineFilter}
                    ariaLabel="Ligne"
                    onChange={setLineFilter}
                    options={[
                      { value: 'all', label: 'Toutes' },
                      ...lines.map((l) => ({ value: String(l.id), label: l.line_number })),
                    ]}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" aria-hidden="true">Machine</label>
                  <div title={lineFilter === 'all' ? "Sélectionnez d'abord une ligne" : undefined}>
                    <SelectField
                      value={machineFilter}
                      ariaLabel="Machine"
                      onChange={setMachineFilter}
                      disabled={lineFilter === 'all'}
                      options={[
                        { value: 'all', label: 'Toutes' },
                        ...machineOptions.map((m) => ({ value: m.id, label: m.label })),
                      ]}
                    />
                  </div>
                </div>
              </div>
              <FilterSummary
                count={analytics?.total ?? 0}
                countLabel="incident(s) dans le périmètre"
                chips={filterChips}
                onClear={clearFilters}
                emptyText="Périmètre par défaut — 7 derniers jours, toutes lignes"
                className="filter-summary-embedded"
              />
            </div>
          </div>

          {analyticsLoading ? (
            <EmptyState>Chargement des indicateurs…</EmptyState>
          ) : !hasAnalyticsData ? (
            <p className="muted" style={{ margin: '16px 0', fontSize: 14 }}>
              Aucun incident sur cette période — ajustez les filtres.
            </p>
          ) : (
            <>
              <div className="pilotage-analytics-kpis">
                {[
                  { label: 'Total incidents', value: analytics?.total ?? 0, sub: 'Sur la période' },
                  {
                    label: 'Taux de clôture',
                    value: `${closureRate}%`,
                    sub: `${trendSummary.closed} clôturés / ${trendSummary.created} créés`,
                    tone: closureRate < 50 ? 'tension' : closureRate < 80 ? 'watch' : 'stable',
                  },
                  {
                    label: 'Solde',
                    value: signedNumber(backlogDelta),
                    sub: 'Créés − clôturés',
                    tone: backlogDelta > 4 ? 'tension' : backlogDelta > 0 ? 'watch' : 'stable',
                  },
                  {
                    label: 'Médiane prise en charge',
                    value: formatDuration(analytics?.median_take_seconds ?? null),
                    sub: 'Avant 1ère action',
                  },
                  {
                    label: 'Médiane clôture',
                    value: formatDuration(analytics?.median_close_seconds ?? null),
                    sub: 'Durée typique',
                  },
                  {
                    label: 'Incidents > 24 h',
                    value: analytics?.open_over_24h ?? 0,
                    sub: 'Actifs qui vieillissent',
                    tone: (analytics?.open_over_24h ?? 0) > 0 ? 'watch' : 'stable',
                  },
                ].map(({ label, value, sub, tone }) => (
                  <div
                    key={label}
                    className={`pilotage-analytics-kpi${tone ? ` pilotage-analytics-kpi-${tone}` : ''}`}
                  >
                    <span className="pilotage-analytics-kpi-label">{label}</span>
                    <strong className="pilotage-analytics-kpi-value">{value}</strong>
                    <span className="pilotage-analytics-kpi-sub">{sub}</span>
                  </div>
                ))}
              </div>

              <section className="pilotage-section">
                <div className="pilotage-section-header">
                  <div>
                    <span className="detail-field-label">Concentrations</span>
                    <h2>Répartition par périmètre</h2>
                  </div>
                  <div className="pilotage-section-actions">
                    <label className="form-label" htmlFor="ranking-limit">
                      Afficher
                    </label>
                    <SelectField
                      id="ranking-limit"
                      value={rankingLimit}
                      onChange={(v) => setRankingLimit(v as '5' | '10' | '20' | 'all')}
                      options={[
                        { value: '5', label: '5 premiers' },
                        { value: '10', label: '10 premiers' },
                        { value: '20', label: '20 premiers' },
                        { value: 'all', label: 'Tous' },
                      ]}
                    />
                  </div>
                </div>
                <div className="pilotage-hotspot-grid">
                  <Ranking
                    title="Lignes"
                    items={rankingItems.lines}
                    emptyText="Aucune ligne dominante."
                    total={analytics?.total ?? 0}
                    limit={rankingLimit}
                  />
                  <Ranking
                    title="Machines"
                    items={rankingItems.machines}
                    emptyText="Aucune machine récurrente."
                    tone="red"
                    total={analytics?.total ?? 0}
                    limit={rankingLimit}
                  />
                  <Ranking
                    title="Types d'anomalie"
                    items={rankingItems.states}
                    emptyText="Aucune anomalie sur cette période."
                    tone="green"
                    total={analytics?.total ?? 0}
                    limit={rankingLimit}
                  />
                </div>
              </section>

              <section className="pilotage-section">
                <div className="pilotage-section-header">
                  <div>
                    <span className="detail-field-label">Historique journalier</span>
                    <h2>Créations et clôtures</h2>
                  </div>
                  <div className="pilotage-trend-totals">
                    <span>
                      <strong>{trendSummary.created}</strong> créés
                    </span>
                    <span>
                      <strong>{trendSummary.closed}</strong> clôturés
                    </span>
                    <span
                      className={
                        backlogDelta > 0
                          ? 'trend-balance-bad'
                          : backlogDelta < 0
                            ? 'trend-balance-good'
                            : ''
                      }
                    >
                      Solde <strong>{signedNumber(backlogDelta)}</strong>
                    </span>
                  </div>
                </div>
                <div className="card pilotage-card pilotage-trend-card">
                  <div className="card-body">
                    <TrendChart trend={analytics?.trend ?? []} />
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
      </main>
    </>
  );
}
