import { WorkshopIncidentMetrics } from '../types';
import type { Dispatch, SetStateAction } from 'react';
import type { DashboardFilters as Filters } from '../hooks/useDashboardFilters';

interface IncidentMetricsBarProps {
  metricsLoading: boolean;
  metrics: WorkshopIncidentMetrics | null;
  filters: Filters;
  role?: string;
  createdByMeCount?: number;
  requestsCount?: number;
  onSetFilters: Dispatch<SetStateAction<Filters>>;
}

const RESET = { status: 'all', aging: 'all', priority: 'all', taken: 'all', scope: 'all' };

// Compteurs calculés côté client (hors endpoint métriques serveur).
interface ExtraCounts {
  createdByMe: number;
  requests: number;
}

interface MetricConfig {
  key: string;
  label: string;
  getValue: (m: WorkshopIncidentMetrics, extras: ExtraCounts) => React.ReactNode;
  getBadgeValue?: (m: WorkshopIncidentMetrics, extras: ExtraCounts) => number;
  isActive: (f: Filters) => boolean;
  getFilter: (f: Filters) => Partial<Filters>;
  roles?: string[];
  // Niveau d'attention (doctrine §5.1) : la tuile s'allume quand sa valeur > 0,
  // avec la même grammaire de couleurs que le liseré des cartes incident.
  tone?: 'watch' | 'act' | 'critical';
}

const BASE_METRIC_CONFIGS: MetricConfig[] = [
  {
    key: 'total',
    label: 'Total',
    getValue: (m) => m.total,
    isActive: (f) =>
      f.status === 'all' &&
      f.aging === 'all' &&
      f.priority === 'all' &&
      f.taken === 'all' &&
      (f.scope ?? 'all') === 'all',
    getFilter: () => RESET,
  },
  {
    key: 'open',
    label: 'Ouverts',
    getValue: (m) => m.open,
    isActive: (f) => f.status === 'OPEN',
    getFilter: () => ({ ...RESET, status: 'OPEN' }),
  },
  {
    key: 'pending',
    label: 'En attente',
    getValue: (m) => m.pending,
    isActive: (f) => f.status === 'PENDING',
    getFilter: () => ({ ...RESET, status: 'PENDING' }),
  },
  {
    key: 'over_7d',
    label: 'Ouverts > 7j',
    getValue: (m) => m.open_over_7d,
    isActive: (f) => f.aging === 'over_7d',
    getFilter: () => ({ ...RESET, aging: 'over_7d' }),
    tone: 'watch',
  },
  {
    key: 'priority',
    label: 'Urgents',
    getValue: (m) => m.priority,
    isActive: (f) => f.priority === 'urgent',
    getFilter: (f) => ({ ...RESET, priority: f.priority === 'urgent' ? 'all' : 'urgent' }),
    tone: 'critical',
  },
  {
    key: 'not_taken',
    label: 'Non pris',
    getValue: (m) => m.not_taken,
    isActive: (f) => f.taken === 'not_taken',
    getFilter: (f) => ({ ...RESET, taken: f.taken === 'not_taken' ? 'all' : 'not_taken' }),
    tone: 'act',
  },
];

const ROLE_METRIC_CONFIGS: MetricConfig[] = [
  {
    key: 'created_by_me',
    label: 'Créés par moi',
    getValue: (_m, extras) => extras.createdByMe,
    isActive: (f) => f.scope === 'created_by_me',
    getFilter: (f) => ({ ...RESET, scope: f.scope === 'created_by_me' ? 'all' : 'created_by_me' }),
    roles: ['OPERATOR'],
  },
  {
    key: 'assigned_to_me',
    label: 'Pris par moi',
    getValue: (m) => m.assigned_to_me ?? 0,
    isActive: (f) => f.scope === 'assigned_to_me',
    getFilter: (f) => ({
      ...RESET,
      scope: f.scope === 'assigned_to_me' ? 'all' : 'assigned_to_me',
    }),
    roles: ['MAINTENANCE'],
  },
  {
    // Inbox d'arbitrage : demandes de correction/annulation en attente de décision.
    key: 'requests',
    label: 'À arbitrer',
    getValue: (_m, extras) => extras.requests,
    getBadgeValue: (m) => m.arbitration_unread ?? 0,
    isActive: (f) => f.scope === 'requests',
    getFilter: (f) => ({ ...RESET, scope: f.scope === 'requests' ? 'all' : 'requests' }),
    roles: ['RESPONSABLE'],
    tone: 'act',
  },
  {
    key: 'followed',
    label: 'Suivis',
    getValue: (m) => m.followed ?? 0,
    isActive: (f) => f.scope === 'followed',
    getFilter: (f) => ({ ...RESET, scope: f.scope === 'followed' ? 'all' : 'followed' }),
    roles: ['RESPONSABLE'],
  },
];

const METRIC_CONFIGS = [...BASE_METRIC_CONFIGS, ...ROLE_METRIC_CONFIGS];

const DEFAULT_METRIC_ORDER = ['priority', 'not_taken', 'pending', 'over_7d', 'open', 'total'];

const ROLE_METRIC_ORDER: Record<string, string[]> = {
  OPERATOR: ['created_by_me', 'pending', 'not_taken', 'priority', 'over_7d', 'open', 'total'],
  MAINTENANCE: ['priority', 'not_taken', 'assigned_to_me', 'pending', 'over_7d', 'open', 'total'],
  RESPONSABLE: [
    'requests',
    'priority',
    'not_taken',
    'over_7d',
    'pending',
    'followed',
    'open',
    'total',
  ],
};

function getOrderedMetricConfigs(role?: string): MetricConfig[] {
  const order = ROLE_METRIC_ORDER[role ?? ''] ?? DEFAULT_METRIC_ORDER;
  return order.flatMap((key) => {
    const config = METRIC_CONFIGS.find((cfg) => cfg.key === key);
    if (!config) return [];
    if (config.roles && !config.roles.includes(role ?? '')) return [];
    return [config];
  });
}

export default function IncidentMetricsBar({
  metricsLoading,
  metrics,
  filters,
  role,
  createdByMeCount = 0,
  requestsCount = 0,
  onSetFilters,
}: IncidentMetricsBarProps) {
  const extras: ExtraCounts = { createdByMe: createdByMeCount, requests: requestsCount };
  const orderedMetrics = getOrderedMetricConfigs(role);
  const showClosedToday = !metricsLoading && !!metrics && (metrics.closed_today ?? 0) > 0;
  const tileCount =
    metricsLoading || !metrics ? 0 : orderedMetrics.length + (showClosedToday ? 1 : 0);

  function renderClosedTodayTile(metricData: WorkshopIncidentMetrics) {
    return (
      <div className="workshop-metric" key="closed_today">
        <span className="workshop-metric-label">Clôturés aujourd'hui</span>
        <strong>{metricData.closed_today}</strong>
      </div>
    );
  }

  function renderMetricTile(cfg: MetricConfig, metricData: WorkshopIncidentMetrics) {
    const value = cfg.getValue(metricData, extras);
    const badgeValue = cfg.getBadgeValue?.(metricData, extras) ?? 0;
    const hasNotificationBadge = badgeValue > 0;
    const badgeLabel = badgeValue > 99 ? '99+' : String(badgeValue);
    const toneClass =
      cfg.tone && typeof value === 'number' && value > 0 ? ` workshop-metric--${cfg.tone}` : '';
    const notificationClass = hasNotificationBadge ? ' workshop-metric--has-notif' : '';

    return (
      <button
        key={cfg.key}
        className={`workshop-metric ${cfg.isActive(filters) ? 'active' : ''}${toneClass}${notificationClass}`}
        aria-label={
          hasNotificationBadge
            ? `${cfg.label}, ${badgeValue} nouveau${badgeValue > 1 ? 'x' : ''} cas non consulté${badgeValue > 1 ? 's' : ''}`
            : undefined
        }
        onClick={() => onSetFilters((prev: Filters) => ({ ...prev, ...cfg.getFilter(prev) }))}
        type="button"
      >
        <span className="workshop-metric-label">{cfg.label}</span>
        <strong>{value}</strong>
        {hasNotificationBadge && (
          <span className="workshop-metric-notif" aria-hidden="true">
            {badgeLabel}
          </span>
        )}
        {cfg.key === 'followed' && (metricData.followed_resolved ?? 0) > 0 && (
          <small>{metricData.followed_resolved} clôturé(s)</small>
        )}
      </button>
    );
  }

  return (
    <div
      className="workshop-metrics"
      // Une seule rangée de N colonnes égales : aucun retour à la ligne
      // possible sur desktop, donc aucun orphelin, et toutes les tuiles ont
      // strictement la même largeur (voir workshop.css). data-odd-count sert
      // au palier 2 colonnes mobile : la dernière tuile d'un compte impair
      // prend la rangée entière (pleine largeur = intentionnel, pas cassé).
      style={{ '--metrics-count': tileCount || 6 } as React.CSSProperties}
      data-odd-count={tileCount % 2 === 1 || undefined}
    >
      {!metricsLoading && metrics && (
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {`${metrics.priority} urgent${metrics.priority !== 1 ? 's' : ''}, ${metrics.not_taken} non pris`}
        </div>
      )}
      {metricsLoading ? (
        <div className="workshop-metric workshop-metric-loading">
          <span className="spinner" aria-hidden="true" />
        </div>
      ) : metrics ? (
        <>
          {orderedMetrics.flatMap((cfg) => {
            const items = [];
            if (cfg.key === 'total' && showClosedToday) {
              items.push(renderClosedTodayTile(metrics));
            }
            items.push(renderMetricTile(cfg, metrics));
            return items;
          })}
        </>
      ) : (
        <div className="workshop-metric">
          <span className="workshop-metric-label">KPI indisponibles</span>
          <strong>-</strong>
        </div>
      )}
    </div>
  );
}
