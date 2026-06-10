import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getIncidentMetrics,
  getWorkshopAnalytics,
  listWorkshopIncidents,
  listWorkshopLines,
} from '../api/workshop';
import FilterSummary, { FilterChip } from '../components/FilterSummary';
import EmptyState from '../components/ui/EmptyState';
import ErrorBanner from '../components/ui/ErrorBanner';
import SelectField from '../components/ui/SelectField';
import WorkshopNavBar from '../components/WorkshopNavBar';
import {
  ProductionLine,
  WorkshopAnalytics,
  WorkshopIncident,
  WorkshopIncidentMetrics,
} from '../types';
import { formatShortDate } from '../utils/date';
import { STATE_LABELS } from '../utils/labels';
import {
  getWorkshopMachineOptions,
  lineFilterChip,
  machineFilterChip,
} from '../utils/workshopFilters';
import { HistoryPeriod } from '../utils/workshopHistory';
import { buildAnalyticsParams } from '../utils/workshopAnalytics';
import { usePageTitle } from '../hooks/usePageTitle';

type StatusTone = 'stable' | 'watch' | 'tension';
type RankingLimit = '5' | '10' | '20' | 'all';

const PERIOD_LABELS: Record<HistoryPeriod, string> = {
  today: "Aujourd'hui",
  '7d': '7 derniers jours',
  '30d': '30 derniers jours',
  lifetime: "Tout l'historique",
  custom: 'Personnalisée',
};

const STATE_DESCRIPTIONS: Record<string, string> = {
  SKIPEE_PAR_MACHINE: 'Saut machine',
  SKIPEE_PAR_CONDUCTEUR: 'Saut conducteur',
  DEGRADEE: 'Dégradée',
  INDISPONIBLE: 'Indisponible',
};

function isOver7d(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() > 7 * 24 * 60 * 60 * 1000;
}

function isOver24h(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() > 24 * 60 * 60 * 1000;
}

function formatAge(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} j`;
}

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

// Sparkline SVG inline — affiche la direction des 7 derniers jours
type SparklineProps = {
  data: number[];
  tone: StatusTone;
  width?: number;
  height?: number;
};

function Sparkline({ data, tone, width = 80, height = 28 }: SparklineProps) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - (v / max) * (height - 4) - 2;
    return `${x},${y}`;
  });
  const stroke = tone === 'tension' ? 'var(--color-danger)' : tone === 'watch' ? 'var(--color-watch)' : 'var(--color-success)';
  return (
    <svg width={width} height={height} className="pilotage-sparkline" aria-hidden="true" viewBox={`0 0 ${width} ${height}`}>
      <polyline points={pts.join(' ')} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

// Heatmap ligne — 1 rangée par ligne de production
type LineHeatmapProps = {
  lineStatuses: LineStatus[];
  onOpenLine: (lineId: number) => void;
};

function LineHeatmap({ lineStatuses, onOpenLine }: LineHeatmapProps) {
  if (lineStatuses.length === 0) {
    return (
      <div className="pilotage-heatmap-empty">
        <span className="pilotage-status-dot pilotage-status-dot-stable" aria-hidden="true" />
        Toutes les lignes opérationnelles
      </div>
    );
  }
  return (
    <div className="pilotage-heatmap-scroll">
    <div className="pilotage-heatmap">
      <div className="pilotage-heatmap-head">
        <span>État</span>
        <span>Ligne</span>
        <span>Actifs</span>
        <span>Urgents</span>
        <span>Sans tech.</span>
        <span>Ancienneté</span>
      </div>
      {lineStatuses.map((ls) => {
        const oldest = ls.incidents.length > 0
          ? ls.incidents.reduce((a, b) => new Date(a.created_at) < new Date(b.created_at) ? a : b)
          : null;
        return (
          <button
            key={ls.line.id}
            type="button"
            className={`pilotage-heatmap-row pilotage-heatmap-row-${ls.tone}`}
            onClick={() => onOpenLine(ls.line.id)}
          >
            <span className="pilotage-heatmap-state" aria-hidden="true">
              <span className={`pilotage-status-dot pilotage-status-dot-${ls.tone}`} />
            </span>
            <span className="pilotage-heatmap-linename">
              {ls.line.line_number}
            </span>
            <span data-label="Act." className={`pilotage-heatmap-cell${ls.incidents.length > 0 ? ' pilotage-heatmap-cell-active' : ''}`}>
              {ls.incidents.length}
            </span>
            <span data-label="Urg." className={`pilotage-heatmap-cell${ls.urgentNotTaken > 0 ? ' pilotage-heatmap-cell-critical' : ''}`}>
              {ls.urgentNotTaken > 0 ? ls.urgentNotTaken : '—'}
            </span>
            <span data-label="S.tech" className={`pilotage-heatmap-cell${ls.notTaken > 0 ? ' pilotage-heatmap-cell-warn' : ''}`}>
              {ls.notTaken > 0 ? ls.notTaken : '—'}
            </span>
            <span data-label="Âge" className={`pilotage-heatmap-cell${oldest && isOver7d(oldest.created_at) ? ' pilotage-heatmap-cell-critical' : oldest && isOver24h(oldest.created_at) ? ' pilotage-heatmap-cell-warn' : ''}`}>
              {oldest ? formatAge(oldest.created_at) : '—'}
            </span>
          </button>
        );
      })}
    </div>
    </div>
  );
}

type LineStatus = {
  line: ProductionLine;
  incidents: WorkshopIncident[];
  urgentNotTaken: number;
  notTaken: number;
  oldCases: number;
  tone: StatusTone;
};

// Ranking analytics
type RankingProps = {
  title: string;
  items: { label: string; count: number; description?: string }[];
  emptyText: string;
  tone?: 'blue' | 'green' | 'red';
  total: number;
  limit: RankingLimit;
};

function Ranking({ title, items, emptyText, tone = 'blue', total, limit }: RankingProps) {
  const maxCount = Math.max(...items.map((i) => i.count), 1);
  const visible = limit === 'all' ? items : items.slice(0, Number(limit));
  return (
    <div className="card pilotage-card">
      <div className="card-body">
        <div className="chart-title">{title}</div>
        {items.length === 0 ? (
          <EmptyState>{emptyText}</EmptyState>
        ) : (
          <div className="pilotage-ranking-list">
            {visible.map((item, index) => {
              const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
              const barPct = Math.max((item.count / maxCount) * 100, item.count > 0 ? 6 : 0);
              return (
                <div key={`${title}-${item.label}`} className="pilotage-ranking-row">
                  <span className="pilotage-ranking-rank">{index + 1}</span>
                  <span className="pilotage-ranking-label">
                    <strong title={item.description}>{item.label}</strong>
                    {item.description && <small>{item.description}</small>}
                  </span>
                  <span className={`pilotage-ranking-bar pilotage-ranking-${tone}`}>
                    <i style={{ width: `${barPct}%` }} />
                  </span>
                  <span className="pilotage-ranking-count-wrap">
                    <strong className="pilotage-ranking-count">{item.count}</strong>
                    {total > 0 && <small className="pilotage-ranking-pct">{pct}%</small>}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

type TrendChartProps = { trend: WorkshopAnalytics['trend'] };

function TrendChart({ trend }: TrendChartProps) {
  if (trend.length === 0) return <EmptyState>Aucune donnée sur cette période.</EmptyState>;
  const maxVal = Math.max(...trend.map((d) => Math.max(d.created, d.closed)), 1);
  return (
    <div className="pilotage-trend-chart">
      <div className="pilotage-trend-legend">
        <span className="pilotage-trend-legend-item pilotage-trend-legend-created">Créés</span>
        <span className="pilotage-trend-legend-item pilotage-trend-legend-closed">Clôturés</span>
      </div>
      <div className="pilotage-trend-scroll">
        <div className="pilotage-trend-bars">
          {trend.map((item) => {
            const delta = item.created - item.closed;
            const createdPct = Math.max((item.created / maxVal) * 100, item.created > 0 ? 4 : 0);
            const closedPct = Math.max((item.closed / maxVal) * 100, item.closed > 0 ? 4 : 0);
            return (
              <div key={item.day} className="pilotage-trend-col">
                <div className="pilotage-trend-col-bars">
                  <div className="pilotage-trend-bar-wrap">
                    <div className="pilotage-trend-bar pilotage-trend-bar-created" style={{ height: `${createdPct}%` }} title={`Créés : ${item.created}`} />
                  </div>
                  <div className="pilotage-trend-bar-wrap">
                    <div className="pilotage-trend-bar pilotage-trend-bar-closed" style={{ height: `${closedPct}%` }} title={`Clôturés : ${item.closed}`} />
                  </div>
                </div>
                <span className="pilotage-trend-col-date">{formatShortDate(item.day)}</span>
                <span className={`pilotage-trend-col-delta${delta > 0 ? ' trend-balance-bad' : delta < 0 ? ' trend-balance-good' : ''}`}>
                  {signedNumber(delta)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="pilotage-trend-mobile-list">
        {trend.map((item) => {
          const delta = item.created - item.closed;
          const createdPct = Math.max((item.created / maxVal) * 100, item.created > 0 ? 5 : 0);
          const closedPct = Math.max((item.closed / maxVal) * 100, item.closed > 0 ? 5 : 0);
          return (
            <div key={`mobile-${item.day}`} className="pilotage-trend-mobile-row">
              <div className="pilotage-trend-mobile-head">
                <strong>{formatShortDate(item.day)}</strong>
                <span className={delta > 0 ? 'trend-balance-bad' : delta < 0 ? 'trend-balance-good' : ''}>
                  Solde {signedNumber(delta)}
                </span>
              </div>
              <div className="pilotage-trend-mobile-series">
                <span>Créés</span>
                <strong>{item.created}</strong>
                <i><b className="pilotage-trend-mobile-created" style={{ width: `${createdPct}%` }} /></i>
              </div>
              <div className="pilotage-trend-mobile-series">
                <span>Clôturés</span>
                <strong>{item.closed}</strong>
                <i><b className="pilotage-trend-mobile-closed" style={{ width: `${closedPct}%` }} /></i>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Page principale ────────────────────────────────────────────────

export default function WorkshopPilotagePage() {
  usePageTitle('Pilotage atelier');
  const navigate = useNavigate();

  const [incidents, setIncidents] = useState<WorkshopIncident[]>([]);
  const [metrics, setMetrics] = useState<WorkshopIncidentMetrics | null>(null);
  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [analytics, setAnalytics] = useState<WorkshopAnalytics | null>(null);

  const [realtimeLoading, setRealtimeLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [error, setError] = useState('');
  const [analyticsError, setAnalyticsError] = useState('');
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const [period, setPeriod] = useState<HistoryPeriod>('7d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [lineFilter, setLineFilter] = useState('all');
  const [machineFilter, setMachineFilter] = useState('all');
  const [rankingLimit, setRankingLimit] = useState<RankingLimit>('10');

  function loadRealtime() {
    return Promise.all([listWorkshopIncidents(), getIncidentMetrics()])
      .then(([inc, met]) => {
        setIncidents(inc);
        setMetrics(met);
        setLastRefresh(new Date());
        setError('');
      })
      .catch(() => setError("Impossible de charger la situation temps réel."));
  }

  useEffect(() => {
    setRealtimeLoading(true);
    Promise.all([listWorkshopLines(), loadRealtime()])
      .then(([linesData]) => setLines(linesData))
      .catch(() => {})
      .finally(() => setRealtimeLoading(false));
  }, []);

  useEffect(() => {
    const id = setInterval(loadRealtime, 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (period === 'custom' && customStart && customEnd && customStart > customEnd) {
      setAnalyticsError('La date de début doit être antérieure à la date de fin.');
      return;
    }
    setAnalyticsLoading(true);
    setAnalyticsError('');
    getWorkshopAnalytics(buildAnalyticsParams(period, customStart, customEnd, lineFilter, machineFilter))
      .then(setAnalytics)
      .catch(() => { setAnalytics(null); setAnalyticsError('Impossible de charger les indicateurs.'); })
      .finally(() => setAnalyticsLoading(false));
  }, [period, customStart, customEnd, lineFilter, machineFilter]);

  function goToDashboard(params: Record<string, string> = {}) {
    const search = new URLSearchParams(params).toString();
    navigate(`/workshop/dashboard${search ? `?${search}` : ''}`);
  }

  const machineOptions = getWorkshopMachineOptions(lines, lineFilter);

  // ── Calculs temps réel ─────────────────────────────────────────
  const activeIncidents = useMemo(
    () => incidents.filter((i) => i.status === 'OPEN' || i.status === 'PENDING'),
    [incidents]
  );

  const urgentNotTaken = useMemo(
    () => activeIncidents.filter((i) => i.is_priority && !i.is_taken),
    [activeIncidents]
  );

  const notTaken = useMemo(
    () => activeIncidents.filter((i) => !i.is_taken),
    [activeIncidents]
  );

  const oldCases = useMemo(
    () => activeIncidents.filter((i) => isOver7d(i.created_at)),
    [activeIncidents]
  );

  const statusTone: StatusTone =
    urgentNotTaken.length > 0 || oldCases.length > 0 ? 'tension'
    : notTaken.length > 0 || activeIncidents.length > 0 ? 'watch'
    : 'stable';

  const statusLabel =
    statusTone === 'tension' ? 'Sous tension'
    : statusTone === 'watch' ? 'À surveiller'
    : 'Stable';

  // Sparkline 7j à partir des analytics (créés par jour)
  const sparklineData = useMemo(() => {
    const trend = analytics?.trend ?? [];
    if (trend.length < 2) return [];
    return trend.slice(-7).map((d) => d.created);
  }, [analytics]);

  const lineStatuses = useMemo((): LineStatus[] => {
    return lines
      .map((line) => {
        const li = activeIncidents.filter((i) => i.line_id === line.id);
        const unt = li.filter((i) => i.is_priority && !i.is_taken).length;
        const nt = li.filter((i) => !i.is_taken).length;
        const old = li.filter((i) => isOver7d(i.created_at)).length;
        const tone: StatusTone = unt > 0 || old > 0 ? 'tension' : nt > 0 ? 'watch' : 'stable';
        return { line, incidents: li, urgentNotTaken: unt, notTaken: nt, oldCases: old, tone };
      })
      .filter((ls) => ls.incidents.length > 0)
      .sort((a, b) => {
        const order = { tension: 0, watch: 1, stable: 2 };
        return order[a.tone] - order[b.tone] || b.incidents.length - a.incidents.length;
      });
  }, [lines, activeIncidents]);

  // ── Calculs analytics ──────────────────────────────────────────
  const trendSummary = useMemo(() => {
    const trend = analytics?.trend ?? [];
    return {
      created: trend.reduce((s, d) => s + d.created, 0),
      closed: trend.reduce((s, d) => s + d.closed, 0),
    };
  }, [analytics]);

  const backlogDelta = trendSummary.created - trendSummary.closed;
  const closureRate = trendSummary.created > 0
    ? Math.round((trendSummary.closed / trendSummary.created) * 100)
    : 0;
  const hasAnalyticsData = analytics !== null && analytics.total > 0;

  const filterChips: FilterChip[] = [
    ...(period !== '7d' ? [{ key: 'period', label: `Période: ${PERIOD_LABELS[period]}`, onRemove: () => { setPeriod('7d'); setCustomStart(''); setCustomEnd(''); } }] : []),
    ...(period === 'custom' && customStart ? [{ key: 'start', label: `Début: ${customStart}`, onRemove: () => setCustomStart('') }] : []),
    ...(period === 'custom' && customEnd ? [{ key: 'end', label: `Fin: ${customEnd}`, onRemove: () => setCustomEnd('') }] : []),
    ...lineFilterChip(lines, lineFilter, () => { setLineFilter('all'); setMachineFilter('all'); }),
    ...machineFilterChip(machineFilter, () => setMachineFilter('all')),
  ];

  function clearFilters() {
    setPeriod('7d'); setCustomStart(''); setCustomEnd('');
    setLineFilter('all'); setMachineFilter('all');
  }

  const rankingItems = {
    lines: (analytics?.by_line ?? []).map((item) => ({ label: `Ligne ${item.line_number}`, count: item.count })),
    machines: (analytics?.by_machine ?? []).map((item) => ({ label: item.machine_id, count: item.count })),
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
        <button className="back-link" onClick={() => navigate('/workshop/dashboard')}>
          Retour au dashboard
        </button>

        {error && <ErrorBanner style={{ marginBottom: 12 }}>{error}</ErrorBanner>}

        {/* ════════════════════════════════════════════════════════════
            ZONE 1 — HERO : état global + 4 hero stats
        ════════════════════════════════════════════════════════════ */}
        <div className="pilotage-hero">
          {/* Titre + état */}
          <div className="pilotage-hero-title-row">
            <div>
              <h1 className="pilotage-hero-title">Pilotage atelier</h1>
              <div className="pilotage-hero-state">
                <span className={`pilotage-status-dot pilotage-status-dot-${realtimeLoading ? 'stable' : statusTone}`} aria-hidden="true" />
                <span className={`pilotage-hero-state-label pilotage-hero-state-${statusTone}`}>
                  {realtimeLoading ? 'Chargement…' : statusLabel}
                </span>
                <span className="muted" style={{ fontSize: '0.78rem' }}>
                  · Temps réel · {formatTime(lastRefresh)}
                </span>
              </div>
            </div>
            {!realtimeLoading && activeIncidents.length > 0 && (
              <button type="button" className="btn" onClick={() => goToDashboard()}>
                Ouvrir le dashboard
              </button>
            )}
          </div>

          <div className="sr-only" aria-live="polite" aria-atomic="true">
            {!realtimeLoading && `${urgentNotTaken.length} urgence${urgentNotTaken.length !== 1 ? 's' : ''} non prise${urgentNotTaken.length !== 1 ? 's' : ''}, ${notTaken.length} sans technicien`}
          </div>

          {/* 4 Hero stats */}
          <div className="pilotage-hero-stats">
            {/* Incidents actifs */}
            <button
              type="button"
              className={`pilotage-hero-stat${activeIncidents.length > 0 ? ' pilotage-hero-stat-watch' : ''}`}
              onClick={activeIncidents.length > 0 ? () => goToDashboard() : undefined}
              disabled={activeIncidents.length === 0}
            >
              <span className="pilotage-hero-stat-label">Incidents actifs</span>
              <div className="pilotage-hero-stat-body">
                <strong className="pilotage-hero-stat-value">{realtimeLoading ? '…' : activeIncidents.length}</strong>
                <Sparkline data={sparklineData} tone={activeIncidents.length > 0 ? 'watch' : 'stable'} />
              </div>
              <span className="pilotage-hero-stat-sub">
                {metrics ? `${metrics.open} ouverts · ${metrics.pending} en attente` : '—'}
              </span>
            </button>

            {/* Urgences non prises */}
            <button
              type="button"
              className={`pilotage-hero-stat${urgentNotTaken.length > 0 ? ' pilotage-hero-stat-tension' : ''}`}
              onClick={urgentNotTaken.length > 0 ? () => goToDashboard({ priority: 'urgent', taken: 'not_taken' }) : undefined}
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

            {/* Sans technicien */}
            <button
              type="button"
              className={`pilotage-hero-stat${notTaken.length > 0 ? ' pilotage-hero-stat-watch' : ''}`}
              onClick={notTaken.length > 0 ? () => goToDashboard({ taken: 'not_taken' }) : undefined}
              disabled={notTaken.length === 0}
            >
              <span className="pilotage-hero-stat-label">Sans technicien</span>
              <div className="pilotage-hero-stat-body">
                <strong className="pilotage-hero-stat-value">{realtimeLoading ? '…' : notTaken.length}</strong>
              </div>
              <span className="pilotage-hero-stat-sub">Non pris en charge</span>
            </button>

            {/* Vieillissants */}
            <button
              type="button"
              className={`pilotage-hero-stat${oldCases.length > 0 ? ' pilotage-hero-stat-tension' : ''}`}
              onClick={oldCases.length > 0 ? () => goToDashboard({ age: 'over_7d' }) : undefined}
              disabled={oldCases.length === 0}
            >
              <span className="pilotage-hero-stat-label">Cas &gt; 7 jours</span>
              <div className="pilotage-hero-stat-body">
                <strong className="pilotage-hero-stat-value pilotage-hero-stat-value-critical">
                  {realtimeLoading ? '…' : oldCases.length}
                </strong>
              </div>
              <span className="pilotage-hero-stat-sub">Actifs qui vieillissent</span>
            </button>
          </div>

          {/* Bandeau d'actions urgentes — uniquement si nécessaire */}
          {!realtimeLoading && (urgentNotTaken.length > 0 || oldCases.length > 0 || notTaken.length > 0) && (
            <div className="pilotage-hero-actions">
              {urgentNotTaken.length > 0 && (
                <button type="button" className="btn btn-sm pilotage-decision-action-btn pilotage-decision-action-tension" onClick={() => goToDashboard({ priority: 'urgent', taken: 'not_taken' })}>
                  {urgentNotTaken.length} urgence{urgentNotTaken.length > 1 ? 's' : ''} sans technicien
                </button>
              )}
              {notTaken.length > 0 && (
                <button type="button" className="btn btn-sm pilotage-decision-action-btn pilotage-decision-action-watch" onClick={() => goToDashboard({ taken: 'not_taken' })}>
                  {notTaken.length} non pris en charge
                </button>
              )}
              {oldCases.length > 0 && (
                <button type="button" className="btn btn-sm pilotage-decision-action-btn pilotage-decision-action-watch" onClick={() => goToDashboard({ age: 'over_7d' })}>
                  {oldCases.length} cas &gt; 7 j
                </button>
              )}
            </div>
          )}
        </div>

        {/* ════════════════════════════════════════════════════════════
            ZONE 2 — DIAGNOSTIC : heatmap par ligne
        ════════════════════════════════════════════════════════════ */}
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

        {/* ════════════════════════════════════════════════════════════
            ZONE 3 — ANALYTICS : bilan période
        ════════════════════════════════════════════════════════════ */}
        <div className="pilotage-analytics-zone">
          <div className="pilotage-section-header" style={{ marginBottom: 16 }}>
            <div>
              <span className="detail-field-label">Bilan analytique</span>
              <h2>Indicateurs sur la période</h2>
            </div>
          </div>

          {analyticsError && <ErrorBanner style={{ marginBottom: 12 }}>{analyticsError}</ErrorBanner>}

          {/* Filtres */}
          <div className="card pilotage-filter-card">
            <div className="card-body">
              <div className="history-grid">
                <div className="form-group">
                  <label className="form-label">Période</label>
                  <SelectField
                    value={period}
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
                  <label className="form-label">Début</label>
                  <input type="date" className="form-input" value={customStart} onChange={(e) => setCustomStart(e.target.value)} disabled={period !== 'custom'} />
                </div>
                <div className="form-group">
                  <label className="form-label">Fin</label>
                  <input type="date" className="form-input" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} disabled={period !== 'custom'} />
                </div>
                <div className="form-group">
                  <label className="form-label">Ligne</label>
                  <SelectField
                    value={lineFilter}
                    onChange={(v) => { setLineFilter(v); setMachineFilter('all'); }}
                    options={[{ value: 'all', label: 'Toutes' }, ...lines.map((l) => ({ value: String(l.id), label: l.line_number }))]}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Machine</label>
                  <div title={lineFilter === 'all' ? "Sélectionnez d'abord une ligne" : undefined}>
                    <SelectField
                      value={machineFilter}
                      onChange={setMachineFilter}
                      disabled={lineFilter === 'all'}
                      options={[{ value: 'all', label: 'Toutes' }, ...machineOptions.map((m) => ({ value: m.id, label: m.label }))]}
                    />
                  </div>
                </div>
              </div>
              <FilterSummary
                count={analytics?.total ?? 0}
                countLabel="signalement(s) dans le périmètre"
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
              Aucun signalement sur cette période — ajustez les filtres.
            </p>
          ) : (
            <>
              {/* KPI row analytics */}
              <div className="pilotage-analytics-kpis">
                {[
                  { label: 'Total signalements', value: analytics?.total ?? 0, sub: 'Sur la période' },
                  { label: 'Taux de clôture', value: `${closureRate}%`, sub: `${trendSummary.closed} clôturés / ${trendSummary.created} créés`, tone: closureRate < 50 ? 'tension' : closureRate < 80 ? 'watch' : 'stable' },
                  { label: 'Solde', value: signedNumber(backlogDelta), sub: 'Créés − clôturés', tone: backlogDelta > 4 ? 'tension' : backlogDelta > 0 ? 'watch' : 'stable' },
                  { label: 'Médiane prise en charge', value: formatDuration(analytics?.median_take_seconds ?? null), sub: 'Avant 1ère action' },
                  { label: 'Médiane clôture', value: formatDuration(analytics?.median_close_seconds ?? null), sub: 'Durée typique' },
                  { label: 'Cas > 24 h', value: analytics?.open_over_24h ?? 0, sub: 'Actifs qui vieillissent', tone: (analytics?.open_over_24h ?? 0) > 0 ? 'watch' : 'stable' },
                ].map(({ label, value, sub, tone }) => (
                  <div key={label} className={`pilotage-analytics-kpi${tone ? ` pilotage-analytics-kpi-${tone}` : ''}`}>
                    <span className="pilotage-analytics-kpi-label">{label}</span>
                    <strong className="pilotage-analytics-kpi-value">{value}</strong>
                    <span className="pilotage-analytics-kpi-sub">{sub}</span>
                  </div>
                ))}
              </div>

              {/* Concentrations */}
              <section className="pilotage-section">
                <div className="pilotage-section-header">
                  <div>
                    <span className="detail-field-label">Concentrations</span>
                    <h2>Répartition par périmètre</h2>
                  </div>
                  <div className="pilotage-section-actions">
                    <label className="form-label" htmlFor="ranking-limit">Afficher</label>
                    <SelectField
                      id="ranking-limit"
                      value={rankingLimit}
                      onChange={(v) => setRankingLimit(v as RankingLimit)}
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
                  <Ranking title="Lignes" items={rankingItems.lines} emptyText="Aucune ligne dominante." total={analytics?.total ?? 0} limit={rankingLimit} />
                  <Ranking title="Machines" items={rankingItems.machines} emptyText="Aucune machine récurrente." tone="red" total={analytics?.total ?? 0} limit={rankingLimit} />
                  <Ranking title="Types d'anomalie" items={rankingItems.states} emptyText="Aucune anomalie sur cette période." tone="green" total={analytics?.total ?? 0} limit={rankingLimit} />
                </div>
              </section>

              {/* Trend */}
              <section className="pilotage-section">
                <div className="pilotage-section-header">
                  <div>
                    <span className="detail-field-label">Historique journalier</span>
                    <h2>Créations et clôtures</h2>
                  </div>
                  <div className="pilotage-trend-totals">
                    <span><strong>{trendSummary.created}</strong> créés</span>
                    <span><strong>{trendSummary.closed}</strong> clôturés</span>
                    <span className={backlogDelta > 0 ? 'trend-balance-bad' : backlogDelta < 0 ? 'trend-balance-good' : ''}>
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
