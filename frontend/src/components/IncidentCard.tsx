import { WorkshopIncident } from '../types';
import { formatDateTime, formatElapsed } from '../utils/date';
import { incidentAttentionLevel } from '../utils/attention';
import { ROLE_LABELS, STATE_LABELS } from '../utils/labels';

interface IncidentCardProps {
  incident: WorkshopIncident;
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
  const isResolvedFollowed = incident.is_followed &&
    (incident.status === 'CLOSED' || incident.status === 'CANCELED' || incident.status === 'INVALIDATED');
  const isActiveUrgent = incident.is_priority && !isResolvedFollowed;
  const currentProduct = incident.current_product?.trim();
  // Niveau d'attention unifié (F1/F2) : le liseré gauche encode ce niveau, de
  // sorte que l'urgent émerge par contraste avec les autres, sans agression (P1).
  const attentionLevel = isResolvedFollowed ? 'calm' : incidentAttentionLevel(incident);

  return (
    <div
      role="button"
      className={`incident-card incident-card--attention-${attentionLevel}${isResolvedFollowed ? ' incident-card--resolved-followed' : ''}${isDragging ? ' is-dragging' : ''}${isDropTarget ? ' is-drop-target' : ''}`}
      key={incident.id}
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
      <div className="incident-card-main">
        <div>
          <span className="detail-field-label">Incident</span>
          <h2>Ligne {incident.line_number} · {incident.machine_id}</h2>
        </div>
        <div className="incident-card-status">
          <span className="badge-role">{STATE_LABELS[incident.state] || incident.state}</span>
          {isActiveUrgent && <span className="badge-status priority">Urgent</span>}
          {incident.status === 'CLOSED' && <span className="badge-status neutral">Clôturé</span>}
          {incident.status === 'CANCELED' && <span className="badge-status neutral">Annulé</span>}
          {incident.status === 'INVALIDATED' && <span className="badge-status neutral">Invalidé</span>}
          {incident.is_followed && <span className="badge-status followed">Suivi</span>}
          {incident.is_taken ? (
            <span className="badge-status active">Pris en charge</span>
          ) : (
            <span className="badge-status inactive">Non pris</span>
          )}
        </div>
      </div>
      <div className="incident-tags">
        {isResponsable && !isResolvedFollowed && (
          <button
            type="button"
            className={`request-badge ${incident.is_followed ? 'request-badge-followed' : ''}`}
            onClick={(event) => {
              event.stopPropagation();
              onToggleFollow?.(incident);
            }}
          >
            {incident.is_followed ? 'Retirer du suivi' : 'Suivre'}
          </button>
        )}
        {isResponsable && incident.edit_request && (
          <button
            type="button"
            className="request-badge request-badge-edit"
            onClick={(event) => {
              event.stopPropagation();
              onReviewEdit(event, incident);
            }}
          >
            Correction demandée
          </button>
        )}
        {isResponsable && incident.cancel_request && (
          <button
            type="button"
            className="request-badge request-badge-delete"
            onClick={(event) => {
              event.stopPropagation();
              onReviewDelete(event, incident);
            }}
          >
            Annulation demandée
          </button>
        )}
      </div>

      <div className="incident-card-summary">
        <div className={`incident-summary-primary incident-summary-product${currentProduct ? '' : ' is-missing'}`}>
          <span className="detail-field-label">Produit en cours</span>
          <strong>{currentProduct || 'Non renseigné'}</strong>
          <p>Créé par {`${incident.first_name} ${incident.last_name}`.trim()} · {ROLE_LABELS[incident.role] || incident.role}</p>
        </div>
        <div className="incident-summary-primary">
          <span className="detail-field-label">Équipement</span>
          <strong>{incident.robot_label} · Tête {incident.head_number}</strong>
          <p title={formatDateTime(incident.created_at)}>Depuis {formatElapsed(incident.created_at)}</p>
        </div>
        {(isMaintenance || isResponsable) && (
          <div className="incident-summary-primary">
            <span className="detail-field-label">Traitement</span>
            <strong>
              {incident.taken_by_first_name
                ? `${incident.taken_by_first_name} ${incident.taken_by_last_name || ''}`.trim()
                : 'À prendre'}
            </strong>
            <p>{incident.taken_by_role ? ROLE_LABELS[incident.taken_by_role] || incident.taken_by_role : '-'}</p>
          </div>
        )}
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
