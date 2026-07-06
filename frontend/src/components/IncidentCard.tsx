import { WorkshopIncident } from '../types';
import { formatDateTime, formatElapsed } from '../utils/date';
import { incidentAttentionLevel } from '../utils/attention';
import { ROLE_LABELS } from '../utils/labels';
import {
  IncidentFollowedChip,
  IncidentPriorityChip,
  IncidentStateChip,
  IncidentStatusChip,
  IncidentTakenChip,
  isIncidentResolved,
} from './IncidentBadges';

interface IncidentCardProps {
  incident: WorkshopIncident;
  isSelected?: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  canReorder: boolean;
  isResponsable: boolean;
  isMaintenance: boolean;
  onDragStart: (event: React.DragEvent<HTMLElement>, incidentId: number) => void;
  onDragOver: (event: React.DragEvent<HTMLElement>, incidentId: number, clientY: number) => void;
  onDragLeave: (incidentId: number) => void;
  onDrop: (event: React.DragEvent<HTMLElement>, incidentId: number) => void;
  onDragEnd: () => void;
  onClick: (incident: WorkshopIncident) => void;
  onToggleFollow?: (incident: WorkshopIncident) => void;
  onReviewEdit: (event: React.MouseEvent, incident: WorkshopIncident) => void;
  onReviewDelete: (event: React.MouseEvent, incident: WorkshopIncident) => void;
}

export default function IncidentCard({
  incident,
  isSelected = false,
  isDragging,
  isDropTarget,
  canReorder,
  isResponsable,
  isMaintenance,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onClick,
  onToggleFollow,
  onReviewEdit,
  onReviewDelete,
}: IncidentCardProps) {
  const isResolved = isIncidentResolved(incident);
  const isResolvedFollowed = incident.is_followed && isResolved;
  const isActiveUrgent = incident.is_priority && !isResolved;
  const currentProduct = incident.current_product?.trim();
  // Niveau d'attention unifié (F1/F2) : le liseré gauche encode ce niveau, de
  // sorte que l'urgent émerge par contraste avec les autres, sans agression (P1).
  const attentionLevel = isResolvedFollowed ? 'calm' : incidentAttentionLevel(incident);

  return (
    <div
      role="button"
      className={`incident-card incident-card--attention-${attentionLevel}${isResolvedFollowed ? ' incident-card--resolved-followed' : ''}${isSelected ? ' is-selected' : ''}${isDragging ? ' is-dragging' : ''}${isDropTarget ? ' is-drop-target' : ''}`}
      aria-current={isSelected || undefined}
      draggable={canReorder}
      onDragStart={(event) => {
        if (!canReorder) return;
        onDragStart(event, incident.id);
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(incident.id));
      }}
      onDragOver={(event) => {
        event.preventDefault();
        onDragOver(event, incident.id, event.clientY);
      }}
      onDragLeave={() => onDragLeave(incident.id)}
      onDrop={(event) => {
        event.preventDefault();
        onDrop(event, incident.id);
      }}
      onDragEnd={onDragEnd}
      onClick={() => onClick(incident)}
      tabIndex={0}
      aria-label={`Ouvrir incident${isActiveUrgent ? ' urgent' : ''} ligne ${incident.line_number}, machine ${incident.machine_id}, statut ${incident.status}`}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick(incident);
        }
      }}
    >
      {isResolvedFollowed && (
        <div className="incident-followed-resolved-banner">
          <strong>{incident.status === 'CLOSED' ? 'Incident clôturé' : 'Incident annulé'}</strong>
          <span>Conservé dans vos suivis</span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={(event) => {
              event.stopPropagation();
              onToggleFollow?.(incident);
            }}
          >
            Retirer du suivi
          </button>
        </div>
      )}
      {canReorder && (
        <span
          className="incident-drag-grip"
          title="Glisser pour changer l'ordre de traitement"
          aria-hidden="true"
        >
          <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
            <circle cx="2.5" cy="2.5" r="1.5" />
            <circle cx="7.5" cy="2.5" r="1.5" />
            <circle cx="2.5" cy="8" r="1.5" />
            <circle cx="7.5" cy="8" r="1.5" />
            <circle cx="2.5" cy="13.5" r="1.5" />
            <circle cx="7.5" cy="13.5" r="1.5" />
          </svg>
        </span>
      )}
      <div className="incident-card-main">
        <h2>
          Ligne {incident.line_number} · {incident.machine_id}
        </h2>
        <div className="incident-card-controls">
          <div className="incident-card-status" aria-label="Statuts de l'incident">
            <IncidentStateChip incident={incident} />
            <IncidentPriorityChip incident={incident} />
            <IncidentStatusChip incident={incident} />
            {incident.is_followed && <IncidentFollowedChip />}
            {/* Le statut de prise en charge n'est badgé que pour l'opérateur :
                technicien et responsable le lisent dans la ligne méta (un signal,
                un canal — pas de redondance). */}
            {!isMaintenance && !isResponsable && <IncidentTakenChip incident={incident} />}
          </div>
          {isResponsable && !isResolvedFollowed && (
            <button
              type="button"
              className={`incident-follow-toggle${incident.is_followed ? ' is-active' : ''}`}
              aria-label={incident.is_followed ? 'Retirer du suivi' : 'Suivre cet incident'}
              title={incident.is_followed ? 'Retirer du suivi' : 'Suivre cet incident'}
              onClick={(event) => {
                event.stopPropagation();
                onToggleFollow?.(incident);
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill={incident.is_followed ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polygon points="12 2 15.1 8.3 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 8.9 8.3 12 2" />
              </svg>
            </button>
          )}
        </div>
      </div>
      {isResponsable && (Boolean(incident.edit_request) || Boolean(incident.cancel_request)) && (
        <div className="incident-card-actions">
          {incident.edit_request && (
            <button
              type="button"
              className="incident-request-action incident-request-action--edit"
              onClick={(event) => {
                event.stopPropagation();
                onReviewEdit(event, incident);
              }}
            >
              Correction demandée
            </button>
          )}
          {incident.cancel_request && (
            <button
              type="button"
              className="incident-request-action incident-request-action--delete"
              onClick={(event) => {
                event.stopPropagation();
                onReviewDelete(event, incident);
              }}
            >
              Annulation demandée
            </button>
          )}
        </div>
      )}

      <div className="incident-card-meta">
        {currentProduct ? (
          <span className="incident-meta-item">
            Produit <strong>{currentProduct}</strong>
          </span>
        ) : (
          <span className="incident-meta-item incident-meta-missing">Produit non renseigné</span>
        )}
        <span className="incident-meta-sep" aria-hidden="true">
          ·
        </span>
        <span className="incident-meta-item">
          {incident.robot_label} · Tête {incident.head_number}
        </span>
        <span className="incident-meta-sep" aria-hidden="true">
          ·
        </span>
        <span className="incident-meta-item" title={formatDateTime(incident.created_at)}>
          Depuis {formatElapsed(incident.created_at)}
        </span>
        {(isMaintenance || isResponsable) && (
          <>
            <span className="incident-meta-sep" aria-hidden="true">
              ·
            </span>
            {incident.taken_by_first_name ? (
              <span className="incident-meta-item">
                Pris par{' '}
                <strong>
                  {`${incident.taken_by_first_name} ${incident.taken_by_last_name || ''}`.trim()}
                </strong>
                {incident.taken_by_role
                  ? ` (${ROLE_LABELS[incident.taken_by_role] || incident.taken_by_role})`
                  : ''}
              </span>
            ) : (
              <span className="incident-meta-item">Non pris</span>
            )}
          </>
        )}
      </div>
      <div className="incident-card-footer">
        Créé par {`${incident.first_name} ${incident.last_name}`.trim()} ·{' '}
        {ROLE_LABELS[incident.role] || incident.role}
      </div>

      {incident.responsible_comment && (
        <div className="incident-responsible-instruction">
          <strong>Consigne responsable</strong>
          <p>{incident.responsible_comment}</p>
        </div>
      )}
      {incident.status === 'PENDING' && incident.diagnostic && (
        <div className="notice" style={{ marginTop: 12 }}>
          Suspension justifiée : {incident.diagnostic}
        </div>
      )}
    </div>
  );
}
