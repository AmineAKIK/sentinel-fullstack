import { AnalyticsParams } from '../api/workshop';
import { WorkshopIncidentEvent } from '../types';
export { formatDateTime, formatSeconds } from './date';
export { STATE_LABELS, STATUS_LABELS } from './labels';

export type HistoryPeriod = 'today' | '7d' | '30d' | 'lifetime' | 'custom';

export const EVENT_LABELS: Record<string, string> = {
  INCIDENT_CREATED: 'Signalement créé',
  INCIDENT_TAKEN: 'Prise en charge',
  INCIDENT_SET_PENDING: 'Mis en attente',
  INCIDENT_RESUMED: 'Reprise en cours',
  INCIDENT_CLOSED: 'Clôturé',
  INCIDENT_CANCELED: 'Signalement annulé',
  INCIDENT_INVALIDATED: 'Cas clôturé invalidé',
  INCIDENT_FOLLOWED: 'Suivi ajouté',
  INCIDENT_UNFOLLOWED: 'Suivi retiré',
  INCIDENT_UPDATED: 'Incident modifié',
  INCIDENT_REORDERED: 'Réordonnancement',
  EDIT_REQUESTED: 'Correction demandée',
  EDIT_APPLIED: 'Correction appliquée',
  EDIT_REJECTED: 'Correction refusée',
  CANCEL_REQUESTED: 'Annulation demandée',
  CANCEL_REQUEST_REJECTED: 'Annulation refusée',
  DELETE_REQUESTED: 'Annulation demandée',
  DELETE_REQUEST_REJECTED: 'Annulation refusée',
  PRIORITY_CHANGED: 'Priorité modifiée',
  ORDER_CHANGED: 'Réordonnancement',
  RESPONSIBLE_COMMENT_UPDATED: 'Consigne responsable',
};

import { STATUS_LABELS } from './labels';

export function formatEventActor(event: WorkshopIncidentEvent): string {
  if (!event.first_name) return 'Systeme';
  const fullName = `${event.first_name} ${event.last_name || ''}`.trim();
  return event.role ? `${fullName} · ${event.role}` : fullName;
}

export function formatEventDetail(event: WorkshopIncidentEvent): string {
  if (!event.payload) return '';
  const payload = event.payload as Record<string, unknown>;

  if (event.event_type === 'PRIORITY_CHANGED') {
    if (payload.value !== undefined) return payload.value ? 'Urgent' : 'Normal';
    if (payload.to !== undefined) return payload.to ? 'Urgent' : 'Normal';
  }
  if (event.event_type === 'ORDER_CHANGED' && payload.from !== undefined && payload.to !== undefined) {
    return `position ${payload.from} → ${payload.to}`;
  }
  if (event.event_type === 'INCIDENT_UPDATED') {
    const fields = Array.isArray(payload.fields) ? payload.fields : payload.changedFields;
    if (Array.isArray(fields) && fields.length > 0) return `champs: ${fields.join(', ')}`;
  }
  if (event.event_type === 'RESPONSIBLE_COMMENT_UPDATED') return 'consigne mise à jour';
  if (event.event_type === 'INCIDENT_INVALIDATED') {
    if (payload.reason) return String(payload.reason);
    return 'retiré des statistiques et de la connaissance';
  }
  if (event.event_type === 'INCIDENT_SET_PENDING' && payload.diagnostic) {
    return `diagnostic: ${String(payload.diagnostic).slice(0, 60)}`;
  }
  if (event.event_type === 'INCIDENT_CLOSED' && payload.interventionNote) {
    return `note: ${String(payload.interventionNote).slice(0, 60)}`;
  }
  if (event.event_type === 'CANCEL_REQUESTED' || event.event_type === 'DELETE_REQUESTED') {
    if (payload.reason) return String(payload.reason).slice(0, 80);
  }
  return '';
}

export function buildAnalyticsParams(
  period: HistoryPeriod,
  customStart: string,
  customEnd: string,
  lineFilter: string,
  machineFilter: string
): AnalyticsParams {
  const params: AnalyticsParams = {};
  const endDate = new Date();

  if (period === 'today') {
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    params.start = startDate.toISOString();
    params.end = endDate.toISOString();
  }
  if (period === '7d' || period === '30d') {
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - (period === '7d' ? 7 : 30));
    params.start = startDate.toISOString();
    params.end = endDate.toISOString();
  }
  if (period === 'custom') {
    if (customStart) params.start = new Date(customStart).toISOString();
    if (customEnd) {
      const customEndDate = new Date(customEnd);
      customEndDate.setHours(23, 59, 59, 999);
      params.end = customEndDate.toISOString();
    }
  }
  if (lineFilter !== 'all') params.lineId = Number(lineFilter);
  if (machineFilter !== 'all') params.machineId = machineFilter;
  return params;
}
