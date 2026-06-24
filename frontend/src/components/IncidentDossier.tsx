import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import EmptyState from './ui/EmptyState';
import { WorkshopIncident, WorkshopIncidentEvent } from '../types';
import { ROLE_LABELS, STATE_LABELS, STATUS_LABELS } from '../utils/labels';
import { EVENT_LABELS, formatDateTime, formatEventActor, formatEventDetail } from '../utils/workshopHistory';
import { formatIncidentDuration } from '../utils/durationFormat';

const TEXT_COLLAPSE_THRESHOLD = 300;

type IncidentTextSectionProps = {
  label: string;
  value: string | null | undefined;
  primary?: boolean;
};

function IncidentTextSection({ label, value, primary }: IncidentTextSectionProps) {
  const [expanded, setExpanded] = useState(false);
  if (!value) return null;
  const isTruncatable = value.length > TEXT_COLLAPSE_THRESHOLD;
  const displayValue =
    isTruncatable && !expanded ? value.slice(0, TEXT_COLLAPSE_THRESHOLD) + '…' : value;
  return (
    <div className={`history-text-section${primary ? ' history-text-section-primary' : ''}`}>
      <span className="detail-field-label">{label}</span>
      <p>{displayValue}</p>
      {isTruncatable && (
        <button
          type="button"
          className="history-text-expand"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Réduire' : 'Voir tout'}
        </button>
      )}
    </div>
  );
}

interface IncidentDossierProps {
  incident: WorkshopIncident;
  events: WorkshopIncidentEvent[];
  eventsLoading: boolean;
  highlightedEventId: number | null;
}

export default function IncidentDossier({
  incident,
  events,
  eventsLoading,
  highlightedEventId,
}: IncidentDossierProps) {
  const navigate = useNavigate();
  const hasKnowledge = incident.status === 'CLOSED' && Boolean(incident.intervention_note);

  // Contexte machine : mène à la connaissance de cette ligne+machine, filtre
  // pré-rempli (P3 — répondre, pas faire chercher). Même geste que sur le
  // détail du tableau de bord. L'historique n'y figure pas : on y est déjà.
  const machineContextQuery = `line=${incident.line_id}&machine=${encodeURIComponent(incident.machine_id)}`;

  return (
    <>
      <div className="history-timeline-header">
        <div className="history-timeline-header-top">
          <div>
            <span className="detail-field-label">Dossier incident</span>
            <h2>
              Ligne {incident.line_number} · {incident.machine_id}
            </h2>
          </div>
          <span className="status-pill">
            {STATUS_LABELS[incident.status] ?? incident.status}
          </span>
        </div>
        <div className="action-bar history-knowledge-actions">
          {hasKnowledge && (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => void navigate(`/workshop/knowledge?incident=${incident.id}`)}
            >
              Cette fiche connaissance
            </button>
          )}
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => void navigate(`/workshop/knowledge?${machineContextQuery}`)}
          >
            Solutions déjà appliquées
          </button>
        </div>
      </div>

      <div className="history-dossier-summary">
        <div>
          <span className="detail-field-label">Équipement</span>
          <strong>
            {incident.robot_label} · Tête {incident.head_number}
          </strong>
          <p>{STATE_LABELS[incident.state] ?? incident.state}</p>
        </div>
        <div>
          <span className="detail-field-label">Produit</span>
          <strong>{incident.current_product ?? 'Produit non renseigné'}</strong>
        </div>
        <div>
          <span className="detail-field-label">Déclarant</span>
          <strong>
            {incident.first_name} {incident.last_name}
          </strong>
          <p>{ROLE_LABELS[incident.role] ?? incident.role}</p>
        </div>
        <div>
          <span className="detail-field-label">Technicien</span>
          <strong>
            {incident.taken_by_first_name
              ? `${incident.taken_by_first_name} ${incident.taken_by_last_name ?? ''}`.trim()
              : 'Non pris en charge'}
          </strong>
          <p>
            {incident.taken_by_role
              ? (ROLE_LABELS[incident.taken_by_role] ?? incident.taken_by_role)
              : '—'}
          </p>
        </div>
        <div>
          <span className="detail-field-label">Durée dossier</span>
          <strong>
            {formatIncidentDuration(incident.created_at, incident.updated_at, incident.status)}
          </strong>
          <p>Créé le {formatDateTime(incident.created_at)}</p>
        </div>
      </div>

      <div className="history-texts">
        <IncidentTextSection label="Commentaire opérateur" value={incident.comment} />
        <IncidentTextSection label="Diagnostic" value={incident.diagnostic} />
        <IncidentTextSection label="Note d'intervention" value={incident.intervention_note} primary />
        <IncidentTextSection label="Consigne responsable" value={incident.responsible_comment} />
      </div>

      <div className="history-trace-header">
        <span className="detail-field-label">Trace complète</span>
      </div>
      {eventsLoading ? (
        <EmptyState>Chargement de la trace…</EmptyState>
      ) : events.length === 0 ? (
        <EmptyState>Aucune trace pour cet incident.</EmptyState>
      ) : (
        <div className="timeline-list">
          {events.map((event) => {
            const detail = formatEventDetail(event);
            return (
              <div
                key={event.id}
                className={`timeline-item${highlightedEventId === event.id ? ' is-highlighted' : ''}`}
              >
                <div className="timeline-date">{formatDateTime(event.created_at)}</div>
                <div className="timeline-content">
                  <strong>{EVENT_LABELS[event.event_type] ?? event.event_type}</strong>
                  {detail && <span>{detail}</span>}
                  <span className="muted">{formatEventActor(event)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
