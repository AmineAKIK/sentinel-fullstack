import { WorkshopIncidentMetrics } from '../types';
import type { Dispatch, SetStateAction } from 'react';
import type { DashboardFilters as Filters } from '../hooks/useDashboardFilters';

interface IncidentMetricsBarProps {
  metricsLoading: boolean;
  metrics: WorkshopIncidentMetrics | null;
  filters: Filters;
  role?: string;
  createdByMeCount?: number;
  onSetFilters: Dispatch<SetStateAction<Filters>>;
}

const RESET = { status: 'all', aging: 'all', priority: 'all', taken: 'all', scope: 'all' };

interface MetricConfig {
  key: string;
  label: string;
  getValue: (m: WorkshopIncidentMetrics, extra?: number) => React.ReactNode;
  isActive: (f: Filters) => boolean;
  getFilter: (f: Filters) => Partial<Filters>;
  roles?: string[];
}

const METRIC_CONFIGS: MetricConfig[] = [
  {
    key: 'total',
    label: 'Total',
    getValue: (m) => m.total,
    isActive: (f) => f.status === 'all' && f.aging === 'all' && f.priority === 'all' && f.taken === 'all' && (f.scope ?? 'all') === 'all',
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
  },
  {
    key: 'priority',
    label: 'Urgents',
    getValue: (m) => m.priority,
    isActive: (f) => f.priority === 'urgent',
    getFilter: (f) => ({ ...RESET, priority: f.priority === 'urgent' ? 'all' : 'urgent' }),
  },
  {
    key: 'not_taken',
    label: 'Non pris',
    getValue: (m) => m.not_taken,
    isActive: (f) => f.taken === 'not_taken',
    getFilter: (f) => ({ ...RESET, taken: f.taken === 'not_taken' ? 'all' : 'not_taken' }),
  },
];

const ROLE_METRIC_CONFIGS: MetricConfig[] = [
  {
    key: 'created_by_me',
    label: 'Créés par moi',
    getValue: (_m, extra = 0) => extra,
    isActive: (f) => f.scope === 'created_by_me',
    getFilter: (f) => ({ ...RESET, scope: f.scope === 'created_by_me' ? 'all' : 'created_by_me' }),
    roles: ['OPERATOR'],
  },
  {
    key: 'assigned_to_me',
    label: 'Pris par moi',
    getValue: (m) => m.assigned_to_me ?? 0,
    isActive: (f) => f.scope === 'assigned_to_me',
    getFilter: (f) => ({ ...RESET, scope: f.scope === 'assigned_to_me' ? 'all' : 'assigned_to_me' }),
    roles: ['MAINTENANCE'],
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

export default function IncidentMetricsBar({
  metricsLoading,
  metrics,
  filters,
  role,
  createdByMeCount = 0,
  onSetFilters,
}: IncidentMetricsBarProps) {
  return (
    <div className="workshop-metrics">
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
          {METRIC_CONFIGS.map((cfg) => (
            <button
              key={cfg.key}
              className={`workshop-metric ${cfg.isActive(filters) ? 'active' : ''}`}
              onClick={() => onSetFilters((prev: Filters) => ({ ...prev, ...cfg.getFilter(prev) }))}
              type="button"
            >
              <span>{cfg.label}</span>
              <strong>{cfg.getValue(metrics, createdByMeCount)}</strong>
            </button>
          ))}
          {(metrics.closed_today ?? 0) > 0 && (
            <div className="workshop-metric">
              <span>Clôturés aujourd'hui</span>
              <strong>{metrics.closed_today}</strong>
            </div>
          )}
          {ROLE_METRIC_CONFIGS.filter((cfg) => cfg.roles?.includes(role ?? '')).map((cfg) => (
            <button
              key={cfg.key}
              className={`workshop-metric ${cfg.isActive(filters) ? 'active' : ''}`}
              onClick={() => onSetFilters((prev: Filters) => ({ ...prev, ...cfg.getFilter(prev) }))}
              type="button"
            >
              <span>{cfg.label}</span>
              <strong>{cfg.getValue(metrics, createdByMeCount)}</strong>
              {cfg.key === 'followed' && (metrics.followed_resolved ?? 0) > 0 && (
                <small>{metrics.followed_resolved} clôturé(s)</small>
              )}
            </button>
          ))}
        </>
      ) : (
        <div className="workshop-metric">
          <span>KPI indisponibles</span>
          <strong>-</strong>
        </div>
      )}
    </div>
  );
}
