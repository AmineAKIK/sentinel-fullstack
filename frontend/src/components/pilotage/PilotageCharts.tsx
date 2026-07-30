import { WorkshopAnalytics } from '../../types';
import EmptyState from '../ui/EmptyState';

type StatusTone = 'stable' | 'watch' | 'tension';

type SparklineProps = {
  data: number[];
  tone: StatusTone;
  width?: number;
  height?: number;
};

export function Sparkline({ data, tone, width = 80, height = 28 }: SparklineProps) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - (v / max) * (height - 4) - 2;
    return `${x},${y}`;
  });
  const stroke =
    tone === 'tension'
      ? 'var(--color-danger)'
      : tone === 'watch'
        ? 'var(--color-watch)'
        : 'var(--color-success)';
  return (
    <svg
      className="pilotage-sparkline"
      aria-hidden="true"
      preserveAspectRatio="none"
      viewBox={`0 0 ${width} ${height}`}
    >
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity="0.7"
      />
    </svg>
  );
}

type TrendChartProps = { trend: WorkshopAnalytics['trend'] };

export function TrendChart({ trend }: TrendChartProps) {
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
            const dayLabel = new Date(item.day).toLocaleDateString('fr-FR', {
              day: '2-digit',
              month: '2-digit',
            });
            return (
              <div key={item.day} className="pilotage-trend-col">
                <div className="pilotage-trend-col-bars">
                  <div className="pilotage-trend-bar-wrap">
                    <div
                      className="pilotage-trend-bar pilotage-trend-bar-created"
                      style={{ height: `${createdPct}%` }}
                      title={`Créés : ${item.created}`}
                      aria-hidden="true"
                    />
                    <span className="sr-only">
                      {dayLabel} — Créés : {item.created}
                    </span>
                  </div>
                  <div className="pilotage-trend-bar-wrap">
                    <div
                      className="pilotage-trend-bar pilotage-trend-bar-closed"
                      style={{ height: `${closedPct}%` }}
                      title={`Clôturés : ${item.closed}`}
                      aria-hidden="true"
                    />
                    <span className="sr-only">
                      {dayLabel} — Clôturés : {item.closed}
                    </span>
                  </div>
                </div>
                <span
                  className={`pilotage-trend-delta${delta > 0 ? ' pilotage-trend-delta-bad' : delta < 0 ? ' pilotage-trend-delta-good' : ''}`}
                >
                  {delta > 0 ? `+${delta}` : delta < 0 ? String(delta) : '='}
                </span>
                <span className="pilotage-trend-label" aria-hidden="true">
                  {dayLabel}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

type RankingLimit = '5' | '10' | '20' | 'all';

type RankingProps = {
  title: string;
  items: { label: string; count: number; description?: string }[];
  emptyText: string;
  tone?: 'blue' | 'green' | 'red';
  total: number;
  limit: RankingLimit;
};

export function Ranking({ title, items, emptyText, tone = 'blue', total, limit }: RankingProps) {
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
