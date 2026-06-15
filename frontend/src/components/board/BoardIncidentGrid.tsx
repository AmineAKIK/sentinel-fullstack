import { WorkshopBoardIncident } from '../../types';
import { STATE_LABELS } from '../../utils/labels';
import { ageLabel, formatTime, isOpenOverSevenDays, statusLabel } from '../../utils/boardUtils';

type BoardMode = 'normal' | 'watch' | 'critical';

interface EmptyStateProps {
  boardModeLabel: string;
  title: string;
  detail: string;
}

function BoardEmptyState({ boardModeLabel, title, detail }: EmptyStateProps) {
  return (
    <div className="board-empty-state">
      <span>{boardModeLabel}</span>
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}

interface BoardIncidentGridProps {
  items: WorkshopBoardIncident[];
  activeView: 'alerts' | 'all' | 'lines';
  boardModeLabel: string;
  boardMode: BoardMode;
}

export default function BoardIncidentGrid({
  items,
  activeView,
  boardModeLabel,
  boardMode: _boardMode,
}: BoardIncidentGridProps) {
  if (items.length === 0) {
    return (
      <BoardEmptyState
        boardModeLabel={boardModeLabel}
        title={activeView === 'alerts' ? 'Aucune alerte prioritaire' : 'Aucun incident visible'}
        detail={
          activeView === 'alerts'
            ? 'Les incidents ouverts sans urgence restent visibles dans les autres vues configurées.'
            : 'Le filtrage de cet écran ne retourne aucun incident.'
        }
      />
    );
  }

  return (
    <div className="board-incident-grid">
      {items.map((incident) => {
        const isOldCase = isOpenOverSevenDays(incident);
        return (
          <article
            key={incident.id}
            className={`board-incident-card ${
              incident.is_priority
                ? 'board-incident-critical'
                : incident.status === 'PENDING' || !incident.is_taken
                  ? 'board-incident-watch'
                  : 'board-incident-steady'
            }`}
          >
            <div className="board-incident-top">
              <span>Ligne {incident.line_number}</span>
              <span>{STATE_LABELS[incident.state] ?? incident.state}</span>
            </div>
            <div className="board-incident-product">
              <span>Produit en cours</span>
              <strong>{incident.current_product ?? 'Non renseigné'}</strong>
            </div>
            <div className="board-incident-equipment">
              <span>Équipement</span>
              <strong>{incident.machine_id}</strong>
              <small>
                {incident.robot_label} · Tête {incident.head_number}
              </small>
            </div>
            <div className="board-incident-footer">
              <span>
                Depuis {ageLabel(incident.created_at)} · {formatTime(incident.created_at)}
              </span>
              <div className="board-incident-status">
                {incident.is_priority && (
                  <span className="board-chip board-chip-critical">Urgent</span>
                )}
                {isOldCase && <span className="board-chip board-chip-warning">&gt; 7 j</span>}
                <span
                  className={`board-chip ${
                    incident.status === 'PENDING'
                      ? 'board-chip-warning'
                      : incident.is_taken
                        ? 'board-chip-success'
                        : 'board-chip-danger'
                  }`}
                >
                  {statusLabel(incident)}
                </span>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export { BoardEmptyState };
