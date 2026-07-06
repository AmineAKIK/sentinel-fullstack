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
  isActive: (f: Filters) => boolean;
  getFilter: (f: Filters) => Partial<Filters>;
  roles?: string[];
  // Niveau d'attention (doctrine §5.1) : la tuile s'allume quand sa valeur > 0,
  // avec la même grammaire de couleurs que le liseré des cartes incident.
  tone?: 'watch' | 'act' | 'critical';
}

const METRIC_CONFIGS: MetricConfig[] = [
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
  const roleMetrics = ROLE_METRIC_CONFIGS.filter((cfg) => cfg.roles?.includes(role ?? ''));
  // Nombre réel de tuiles rendues : pilote le nombre de colonnes de la grille
  // (voir workshop.css) pour qu'aucune configuration ne laisse un orphelin
  // en fin de grille — pas de dépendance à la largeur de viewport ici.
  const tileCount =
    metricsLoading || !metrics
      ? 0
      : METRIC_CONFIGS.length + roleMetrics.length + ((metrics.closed_today ?? 0) > 0 ? 1 : 0);
  return (
    <div className="workshop-metrics" data-tile-count={tileCount || undefined}>
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
          {METRIC_CONFIGS.map((cfg) => {
            const value = cfg.getValue(metrics, extras);
            const toneClass =
              cfg.tone && typeof value === 'number' && value > 0
                ? ` workshop-metric--${cfg.tone}`
                : '';
            return (
              <button
                key={cfg.key}
                className={`workshop-metric ${cfg.isActive(filters) ? 'active' : ''}${toneClass}`}
                onClick={() =>
                  onSetFilters((prev: Filters) => ({ ...prev, ...cfg.getFilter(prev) }))
                }
                type="button"
              >
                <span>{cfg.label}</span>
                <strong>{value}</strong>
              </button>
            );
          })}
          {(metrics.closed_today ?? 0) > 0 && (
            <div className="workshop-metric">
              <span>Clôturés aujourd'hui</span>
              <strong>{metrics.closed_today}</strong>
            </div>
          )}
          {roleMetrics.map((cfg) => {
            const value = cfg.getValue(metrics, extras);
            const toneClass =
              cfg.tone && typeof value === 'number' && value > 0
                ? ` workshop-metric--${cfg.tone}`
                : '';
            return (
              <button
                key={cfg.key}
                className={`workshop-metric ${cfg.isActive(filters) ? 'active' : ''}${toneClass}`}
                onClick={() =>
                  onSetFilters((prev: Filters) => ({ ...prev, ...cfg.getFilter(prev) }))
                }
                type="button"
              >
                <span>{cfg.label}</span>
                <strong>{value}</strong>
                {cfg.key === 'followed' && (metrics.followed_resolved ?? 0) > 0 && (
                  <small>{metrics.followed_resolved} clôturé(s)</small>
                )}
              </button>
            );
          })}
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
