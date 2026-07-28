import { WorkshopIncident } from '../types';
import { formatStateLabel, formatStatusLabel } from '../utils/labels';

export function isIncidentResolved(incident: WorkshopIncident): boolean {
  return (
    incident.status === 'CLOSED' ||
    incident.status === 'CANCELED' ||
    incident.status === 'INVALIDATED'
  );
}

export function IncidentStateChip({ incident }: { incident: WorkshopIncident }) {
  return (
    <span className="incident-chip incident-chip--state">{formatStateLabel(incident.state)}</span>
  );
}

export function IncidentPriorityChip({ incident }: { incident: WorkshopIncident }) {
  if (!incident.is_priority || isIncidentResolved(incident)) return null;

  return <span className="incident-chip incident-chip--critical">Urgent</span>;
}

export function IncidentStatusChip({
  incident,
  showOpen = false,
}: {
  incident: WorkshopIncident;
  showOpen?: boolean;
}) {
  if (incident.status === 'OPEN' && !showOpen) return null;

  const tone =
    incident.status === 'PENDING'
      ? 'watch'
      : incident.status === 'CLOSED'
        ? 'success'
        : incident.status === 'OPEN'
          ? 'open'
          : 'neutral';

  return (
    <span className={`incident-chip incident-chip--${tone}`}>
      {formatStatusLabel(incident.status)}
    </span>
  );
}

export function IncidentFollowedChip() {
  return <span className="incident-chip incident-chip--followed">Suivi</span>;
}

export function IncidentTakenChip({ incident }: { incident: WorkshopIncident }) {
  if (incident.is_taken) {
    return <span className="incident-chip incident-chip--success">Pris en charge</span>;
  }

  return <span className="incident-chip incident-chip--act">Non pris</span>;
}
