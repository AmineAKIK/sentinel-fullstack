import { LineStatus } from '../../hooks/usePilotageData';
import { isOlderThanDays } from '../../utils/date';

function formatAge(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} j`;
}

const TONE_LABEL: Record<'stable' | 'watch' | 'tension', string> = {
  stable: 'Stable',
  watch: 'À surveiller',
  tension: 'Sous tension',
};

interface LineHeatmapProps {
  lineStatuses: LineStatus[];
  onOpenLine: (lineId: number) => void;
}

export default function LineHeatmap({ lineStatuses, onOpenLine }: LineHeatmapProps) {
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
          const oldest =
            ls.incidents.length > 0
              ? ls.incidents.reduce((a, b) =>
                  new Date(a.created_at) < new Date(b.created_at) ? a : b
                )
              : null;
          return (
            <button
              key={ls.line.id}
              type="button"
              className={`pilotage-heatmap-row pilotage-heatmap-row-${ls.tone}`}
              onClick={() => onOpenLine(ls.line.id)}
              aria-label={`Ligne ${ls.line.line_number}, ${TONE_LABEL[ls.tone]}, ${ls.incidents.length} incident${ls.incidents.length > 1 ? 's' : ''} actif${ls.incidents.length > 1 ? 's' : ''}, ${ls.urgentNotTaken} urgent${ls.urgentNotTaken > 1 ? 's' : ''} non pris, ${ls.notTaken} sans technicien, ${oldest ? `plus ancien : ${formatAge(oldest.created_at)}` : 'aucun incident'}`}
            >
              <span className="pilotage-heatmap-state" aria-hidden="true">
                <span className={`pilotage-status-dot pilotage-status-dot-${ls.tone}`} />
              </span>
              <span className="pilotage-heatmap-linename" aria-hidden="true">
                {ls.line.line_number}
              </span>
              <span
                data-label="Act."
                aria-hidden="true"
                className={`pilotage-heatmap-cell${ls.incidents.length > 0 ? ' pilotage-heatmap-cell-active' : ''}`}
              >
                {ls.incidents.length}
              </span>
              <span
                data-label="Urg."
                aria-hidden="true"
                className={`pilotage-heatmap-cell${ls.urgentNotTaken > 0 ? ' pilotage-heatmap-cell-critical' : ''}`}
              >
                {ls.urgentNotTaken > 0 ? ls.urgentNotTaken : '—'}
              </span>
              <span
                data-label="S.tech"
                aria-hidden="true"
                className={`pilotage-heatmap-cell${ls.notTaken > 0 ? ' pilotage-heatmap-cell-warn' : ''}`}
              >
                {ls.notTaken > 0 ? ls.notTaken : '—'}
              </span>
              <span
                data-label="Âge"
                aria-hidden="true"
                className={`pilotage-heatmap-cell${
                  oldest && isOlderThanDays(oldest.created_at, 7)
                    ? ' pilotage-heatmap-cell-critical'
                    : oldest && isOlderThanDays(oldest.created_at, 1)
                      ? ' pilotage-heatmap-cell-warn'
                      : ''
                }`}
              >
                {oldest ? formatAge(oldest.created_at) : '—'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
