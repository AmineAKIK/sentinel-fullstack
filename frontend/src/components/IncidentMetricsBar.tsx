import { WorkshopIncidentMetrics } from '../types';

interface Filters {
  lineId: string;
  status: string;
  aging: string;
  priority: string;
  taken: string;
  scope?: string;
  query: string;
}

interface IncidentMetricsBarProps {
  metricsLoading: boolean;
  metrics: WorkshopIncidentMetrics | null;
  filters: Filters;
  role?: string;
  createdByMeCount?: number;
  onSetFilters: (value: any) => void;
}

export default function IncidentMetricsBar({
  metricsLoading,
  metrics,
  filters,
  role,
  createdByMeCount = 0,
  onSetFilters,
}: IncidentMetricsBarProps) {
  const isOperator = role === 'OPERATOR';
  const isResponsable = role === 'RESPONSABLE';
  const isMaintenance = role === 'MAINTENANCE';

  return (
    <div className="workshop-metrics">
      {metricsLoading ? (
        <div className="workshop-metric workshop-metric-loading">
          <span className="spinner" />
        </div>
      ) : metrics ? (
        <>
          <button
            className={`workshop-metric ${
              filters.status === 'all' &&
              filters.aging === 'all' &&
              filters.priority === 'all' &&
              filters.taken === 'all' &&
              (filters.scope ?? 'all') === 'all'
                ? 'active'
                : ''
            }`}
            onClick={() => onSetFilters((prev: Filters) => ({ ...prev, status: 'all', aging: 'all', priority: 'all', taken: 'all', scope: 'all' }))}
            type="button"
          >
            <span>Total</span>
            <strong>{metrics.total}</strong>
          </button>
          <button
            className={`workshop-metric ${filters.status === 'OPEN' ? 'active' : ''}`}
            onClick={() => onSetFilters((prev: Filters) => ({ ...prev, status: 'OPEN', aging: 'all', priority: 'all', taken: 'all', scope: 'all' }))}
            type="button"
          >
            <span>Ouverts</span>
            <strong>{metrics.open}</strong>
          </button>
          <button
            className={`workshop-metric ${filters.status === 'PENDING' ? 'active' : ''}`}
            onClick={() => onSetFilters((prev: Filters) => ({ ...prev, status: 'PENDING', aging: 'all', priority: 'all', taken: 'all', scope: 'all' }))}
            type="button"
          >
            <span>En attente</span>
            <strong>{metrics.pending}</strong>
          </button>
          <button
            className={`workshop-metric ${filters.aging === 'over_7d' ? 'active' : ''}`}
            onClick={() => onSetFilters((prev: Filters) => ({ ...prev, status: 'all', aging: 'over_7d', priority: 'all', taken: 'all', scope: 'all' }))}
            type="button"
          >
            <span>Ouverts &gt; 7j</span>
            <strong>{metrics.open_over_7d}</strong>
          </button>
          <button
            className={`workshop-metric ${filters.priority === 'urgent' ? 'active' : ''}`}
            onClick={() => onSetFilters((prev: Filters) => ({
              ...prev,
              status: 'all',
              aging: 'all',
              scope: 'all',
              priority: prev.priority === 'urgent' ? 'all' : 'urgent',
            }))}
            type="button"
          >
            <span>Urgents</span>
            <strong>{metrics.priority}</strong>
          </button>
          <button
            className={`workshop-metric ${filters.taken === 'not_taken' ? 'active' : ''}`}
            onClick={() => onSetFilters((prev: Filters) => ({
              ...prev,
              status: 'all',
              aging: 'all',
              scope: 'all',
              taken: prev.taken === 'not_taken' ? 'all' : 'not_taken',
            }))}
            type="button"
          >
            <span>Non pris</span>
            <strong>{metrics.not_taken}</strong>
          </button>
          {isOperator && (
            <button
              className={`workshop-metric ${filters.scope === 'created_by_me' ? 'active' : ''}`}
              onClick={() => onSetFilters((prev: Filters) => ({
                ...prev,
                status: 'all',
                aging: 'all',
                priority: 'all',
                taken: 'all',
                scope: prev.scope === 'created_by_me' ? 'all' : 'created_by_me',
              }))}
              type="button"
            >
              <span>Créés par moi</span>
              <strong>{createdByMeCount}</strong>
            </button>
          )}
          {isMaintenance && (
            <button
              className={`workshop-metric ${filters.scope === 'assigned_to_me' ? 'active' : ''}`}
              onClick={() => onSetFilters((prev: Filters) => ({
                ...prev,
                status: 'all',
                aging: 'all',
                priority: 'all',
                taken: 'all',
                scope: prev.scope === 'assigned_to_me' ? 'all' : 'assigned_to_me',
              }))}
              type="button"
            >
              <span>Pris par moi</span>
              <strong>{metrics.assigned_to_me ?? 0}</strong>
            </button>
          )}
          {isResponsable && (
            <button
              className={`workshop-metric ${filters.scope === 'followed' ? 'active' : ''}`}
              onClick={() => onSetFilters((prev: Filters) => ({
                ...prev,
                status: 'all',
                aging: 'all',
                priority: 'all',
                taken: 'all',
                scope: prev.scope === 'followed' ? 'all' : 'followed',
              }))}
              type="button"
            >
              <span>Suivis</span>
              <strong>{metrics.followed ?? 0}</strong>
              {(metrics.followed_resolved ?? 0) > 0 && <small>{metrics.followed_resolved} clôturé(s)</small>}
            </button>
          )}
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
