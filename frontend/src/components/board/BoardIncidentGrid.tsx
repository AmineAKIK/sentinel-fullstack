import { WorkshopBoardIncident } from '../../types';
import { STATE_LABELS } from '../../utils/labels';
import { ageLabel, formatTime, isOpenOverSevenDays, statusLabel } from '../../utils/boardUtils';
import { incidentAttentionLevel } from '../../utils/attention';

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
}

export default function BoardIncidentGrid({
  items,
  activeView,
  boardModeLabel,
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
        const currentProduct = incident.current_product?.trim();
        const responsibleInstruction = incident.responsible_comment?.trim();
        const attentionLevel = incidentAttentionLevel(incident);
        return (
          <article
            key={incident.id}
            className={`board-incident-card board-incident-${attentionLevel}`}
            aria-label={`${incident.is_priority ? 'Incident urgent' : 'Incident'} ligne ${incident.line_number}, machine ${incident.machine_id}`}
          >
            <div className="board-incident-top">
              <strong>Ligne {incident.line_number}</strong>
              <div className="board-incident-top-status">
                <span className="board-incident-state">{STATE_LABELS[incident.state] ?? incident.state}</span>
                {incident.is_priority && (
                  <span className="board-chip board-chip-priority">Urgent</span>
                )}
              </div>
            </div>
            <div className={`board-incident-product${currentProduct ? '' : ' is-missing'}`}>
              <span>Produit en cours</span>
              <strong>{currentProduct || 'Non renseigné'}</strong>
            </div>
            <div className="board-incident-equipment">
              <span>Équipement</span>
              <div className="board-incident-equipment-value">
                <strong>{incident.machine_id}</strong>
                <small>
                  {incident.robot_label} · Tête {incident.head_number}
                </small>
              </div>
            </div>
            <div
              className={`board-incident-instruction${responsibleInstruction ? '' : ' is-empty'}`}
            >
              <span>Consigne</span>
              <p aria-label={responsibleInstruction ? undefined : 'Aucune consigne responsable'}>
                {responsibleInstruction || '—'}
              </p>
            </div>
            <div className="board-incident-footer">
              <span>
                Depuis {ageLabel(incident.created_at)} · {formatTime(incident.created_at)}
              </span>
              <div className="board-incident-status">
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
