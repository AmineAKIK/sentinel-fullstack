import { WorkshopIncidentEvent } from '../types';
export { formatDateTime, formatSeconds } from './date';
export { STATE_LABELS, STATUS_LABELS } from './labels';
export { WORKSHOP_EVENT_LABELS as EVENT_LABELS } from './labels';

export type HistoryPeriod = 'today' | '7d' | '30d' | 'lifetime' | 'custom';

function asString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

export function formatEventActor(event: WorkshopIncidentEvent): string {
  if (!event.first_name) return 'Systeme';
  const fullName = `${event.first_name} ${event.last_name ?? ''}`.trim();
  return event.role ? `${fullName} · ${event.role}` : fullName;
}

export function formatEventDetail(event: WorkshopIncidentEvent): string {
  if (!event.payload) return '';
  const payload = event.payload;

  if (event.event_type === 'PRIORITY_CHANGED') {
    if (payload.value !== undefined) return payload.value ? 'Urgent' : 'Normal';
    if (payload.to !== undefined) return payload.to ? 'Urgent' : 'Normal';
  }
  if (
    event.event_type === 'ORDER_CHANGED' &&
    payload.from !== undefined &&
    payload.to !== undefined
  ) {
    return `position ${asString(payload.from)} → ${asString(payload.to)}`;
  }
  if (event.event_type === 'INCIDENT_UPDATED') {
    const fields = Array.isArray(payload.fields) ? payload.fields : payload.changedFields;
    if (Array.isArray(fields) && fields.length > 0)
      return `champs: ${(fields as string[]).join(', ')}`;
  }
  if (event.event_type === 'RESPONSIBLE_COMMENT_UPDATED') return 'consigne mise à jour';
  if (event.event_type === 'INCIDENT_INVALIDATED') {
    if (payload.reason) return asString(payload.reason);
    return 'retiré des statistiques et de la connaissance';
  }
  if (event.event_type === 'INCIDENT_SET_PENDING' && payload.diagnostic) {
    return `diagnostic: ${asString(payload.diagnostic).slice(0, 60)}`;
  }
  if (event.event_type === 'INCIDENT_CLOSED' && payload.interventionNote) {
    return `note: ${asString(payload.interventionNote).slice(0, 60)}`;
  }
  if (event.event_type === 'CANCEL_REQUESTED' || event.event_type === 'DELETE_REQUESTED') {
    if (payload.reason) return asString(payload.reason).slice(0, 80);
  }
  return '';
}
