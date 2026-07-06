import { WorkshopIncidentMetrics } from '../types';
import type { Dispatch, SetStateAction } from 'react';
import { useRef, useState, useLayoutEffect } from 'react';
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

// Lit le nombre de colonnes réellement rendues par le navigateur pour cette
// grille (via le CSS repeat() actif au breakpoint courant), et calcule
// combien de "spans" ajouter aux dernières tuiles pour que la dernière ligne
// soit toujours pleine — quel que soit le nombre total de tuiles ou la
// largeur d'écran. Approche mesurée plutôt que des règles CSS par cas
// (fragile : chaque total × chaque breakpoint est une combinaison à couvrir
// à la main, et il est facile d'en oublier une, comme on vient de le vérifier).
function useLastRowSpans(tileCount: number): {
  containerRef: React.RefObject<HTMLDivElement>;
  spans: number[];
} {
  const containerRef = useRef<HTMLDivElement>(null);
  const [spans, setSpans] = useState<number[]>([]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || tileCount === 0) {
      setSpans([]);
      return;
    }

    function recompute() {
      if (!el) return;
      const columnCount = getComputedStyle(el).gridTemplateColumns.split(' ').length || 1;
      const remainder = tileCount % columnCount;
      if (remainder === 0 || columnCount === 1) {
        setSpans([]);
        return;
      }
      // La dernière ligne a `remainder` tuiles à répartir sur `columnCount`
      // colonnes : certaines tuiles reçoivent un span supplémentaire pour
      // combler exactement l'espace (ex: 3 tuiles sur 4 colonnes -> spans
      // [2,1,1] ; 2 tuiles sur 3 colonnes -> spans [2,1]).
      const extra = columnCount - remainder;
      const next: number[] = Array(remainder).fill(1);
      for (let i = 0; i < extra; i += 1) {
        next[i % remainder] += 1;
      }
      setSpans(next);
    }

    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(el);
    return () => observer.disconnect();
  }, [tileCount]);

  return { containerRef, spans };
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
  const roleMetrics = ROLE_METRIC_CONFIGS.filter((cfg) => cfg.roles?.includes(role ?? ''));
  const showClosedToday = !metricsLoading && !!metrics && (metrics.closed_today ?? 0) > 0;
  // Ordre de rendu unique : les configs fixes, puis "Clôturés aujourd'hui" si
  // présent, puis les tuiles de rôle — dans cet ordre exact, pour que le
  // calcul des spans (basé sur cet ordre) tombe juste.
  const tileCount =
    metricsLoading || !metrics
      ? 0
      : METRIC_CONFIGS.length + (showClosedToday ? 1 : 0) + roleMetrics.length;
  const { containerRef, spans: lastRowSpans } = useLastRowSpans(tileCount);
  const spanStartIndex = tileCount - lastRowSpans.length;
  let renderIndex = -1;

  function nextSpanStyle(): React.CSSProperties | undefined {
    renderIndex += 1;
    if (renderIndex < spanStartIndex) return undefined;
    const span = lastRowSpans[renderIndex - spanStartIndex];
    return span > 1 ? { gridColumn: `span ${span}` } : undefined;
  }

  return (
    <div className="workshop-metrics" ref={containerRef}>
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
                style={nextSpanStyle()}
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
          {showClosedToday && (
            <div className="workshop-metric" style={nextSpanStyle()}>
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
                style={nextSpanStyle()}
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
