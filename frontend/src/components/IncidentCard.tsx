import { useRef } from 'react';
import { WorkshopIncident } from '../types';
import { formatDateTime, formatElapsed } from '../utils/date';
import { incidentAttentionLevel } from '../utils/attention';
import { formatRoleLabel } from '../utils/labels';
import {
  IncidentFollowedChip,
  IncidentPriorityChip,
  IncidentStateChip,
  IncidentStatusChip,
  IncidentTakenChip,
  isIncidentResolved,
} from './IncidentBadges';
import StarIcon from './icons/StarIcon';

interface IncidentCardProps {
  incident: WorkshopIncident;
  isSelected?: boolean;
  isResponsable: boolean;
  isMaintenance: boolean;
  mutationPending?: boolean;
  onClick: (incident: WorkshopIncident) => void;
  onOpenTrigger?: (trigger: HTMLAnchorElement) => void;
  onToggleFollow?: (incident: WorkshopIncident) => void;
  onReviewEdit: (event: React.MouseEvent, incident: WorkshopIncident) => void;
  onReviewDelete: (event: React.MouseEvent, incident: WorkshopIncident) => void;
}

export default function IncidentCard({
  incident,
  isSelected = false,
  isResponsable,
  isMaintenance,
  mutationPending = false,
  onClick,
  onOpenTrigger,
  onToggleFollow,
  onReviewEdit,
  onReviewDelete,
}: IncidentCardProps) {
  const openTriggerRef = useRef<HTMLAnchorElement | null>(null);
  const isResolved = isIncidentResolved(incident);
  const isResolvedFollowed = incident.is_followed && isResolved;
  const isActiveUrgent = incident.is_priority && !isResolved;
  const currentProduct = incident.current_product?.trim();
  const editArbitrationWaiting = incident.arbitration?.edit?.state === 'WAITING';
  const cancelArbitrationWaiting = incident.arbitration?.cancel?.state === 'WAITING';
  // Niveau d'attention unifié (F1/F2) : le liseré gauche encode ce niveau, de
  // sorte que l'urgent émerge par contraste avec les autres, sans agression (P1).
  const attentionLevel = isResolvedFollowed ? 'calm' : incidentAttentionLevel(incident);

  function openIncident() {
    if (openTriggerRef.current) onOpenTrigger?.(openTriggerRef.current);
    onClick(incident);
  }

  function handleOpenClick(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    openIncident();
  }

  function handleOpenKeyDown(event: React.KeyboardEvent<HTMLAnchorElement>) {
    if (event.key === ' ') {
      event.preventDefault();
      openIncident();
    }
  }

  return (
    <article
      data-incident-card-id={incident.id}
      className={`incident-card incident-card--attention-${attentionLevel}${isResolvedFollowed ? ' incident-card--resolved-followed' : ''}${isResponsable && !isResolvedFollowed ? ' incident-card--has-follow-toggle' : ''}${isSelected ? ' is-selected' : ''}`}
      aria-current={isSelected || undefined}
      aria-busy={mutationPending || undefined}
    >
      <a
        ref={openTriggerRef}
        href={`/workshop/dashboard?incident=${incident.id}`}
        className="incident-card-open"
        onClick={handleOpenClick}
        onKeyDown={handleOpenKeyDown}
        aria-label={`Ouvrir incident${isActiveUrgent ? ' urgent' : ''} ligne ${incident.line_number}, machine ${incident.machine_id}, statut ${incident.status}`}
      >
        {isResolvedFollowed && (
          <div className="incident-followed-resolved-banner">
            <strong>{incident.status === 'CLOSED' ? 'Incident clôturé' : 'Incident annulé'}</strong>
            <span>Conservé dans vos suivis</span>
          </div>
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
          </div>
        </div>
        {/* L'existence d'un arbitrage est un FAIT OPÉRATIONNEL COMMUN : les rôles
            non responsables voient ici un indicateur non interactif. Les commandes
            du responsable restent des boutons frères du lien, plus bas. */}
        {!isResponsable && (Boolean(incident.edit_request) || Boolean(incident.cancel_request)) && (
          <div className="incident-card-actions">
            {incident.edit_request && (
              <span
                className="incident-request-action incident-request-action--edit incident-request-action--readonly"
                aria-label="Modification à arbitrer"
              >
                Modification à arbitrer
              </span>
            )}
            {incident.cancel_request && (
              <span
                className="incident-request-action incident-request-action--delete incident-request-action--readonly"
                aria-label="Annulation à arbitrer"
              >
                Annulation à arbitrer
              </span>
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
                  {incident.taken_by_role ? ` (${formatRoleLabel(incident.taken_by_role)})` : ''}
                </span>
              ) : (
                <span className="incident-meta-item">Non pris</span>
              )}
            </>
          )}
        </div>
        <div className="incident-card-footer">
          Créé par {`${incident.first_name} ${incident.last_name}`.trim()} ·{' '}
          {formatRoleLabel(incident.role)}
        </div>

        {incident.responsible_comment && (
          <div className="incident-responsible-instruction">
            <strong>Consigne du responsable</strong>
            <p>{incident.responsible_comment}</p>
          </div>
        )}
        {incident.status === 'PENDING' && incident.waiting_reason && (
          <div className="notice" style={{ marginTop: 12 }}>
            Motif de mise en attente : {incident.waiting_reason}
          </div>
        )}
      </a>

      {isResponsable && !isResolvedFollowed && (
        <button
          type="button"
          className={`incident-follow-toggle${incident.is_followed ? ' is-active' : ''}`}
          aria-label={
            mutationPending
              ? 'Modification du suivi…'
              : incident.is_followed
                ? 'Retirer du suivi'
                : 'Suivre cet incident'
          }
          title={incident.is_followed ? 'Retirer du suivi' : 'Suivre cet incident'}
          onClick={() => onToggleFollow?.(incident)}
          disabled={mutationPending}
        >
          <StarIcon filled={Boolean(incident.is_followed)} />
        </button>
      )}

      {isResolvedFollowed && (
        <button
          type="button"
          className="btn btn-secondary btn-sm incident-followed-resolved-remove"
          onClick={() => onToggleFollow?.(incident)}
          disabled={mutationPending}
        >
          {mutationPending ? 'Retrait…' : 'Retirer du suivi'}
        </button>
      )}

      {isResponsable && (Boolean(incident.edit_request) || Boolean(incident.cancel_request)) && (
        <div className="incident-card-actions incident-card-actions--interactive">
          {incident.edit_request && (
            <button
              type="button"
              className="incident-request-action incident-request-action--edit"
              onClick={(event) => onReviewEdit(event, incident)}
              disabled={mutationPending}
            >
              {editArbitrationWaiting ? 'Correction en attente' : 'Modification à arbitrer'}
            </button>
          )}
          {incident.cancel_request && (
            <button
              type="button"
              className="incident-request-action incident-request-action--delete"
              onClick={(event) => onReviewDelete(event, incident)}
              disabled={mutationPending}
            >
              {cancelArbitrationWaiting ? 'Annulation en attente' : 'Annulation à arbitrer'}
            </button>
          )}
        </div>
      )}
    </article>
  );
}
