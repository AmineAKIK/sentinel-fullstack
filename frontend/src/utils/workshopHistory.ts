import { AnalyticsParams } from '../api/workshop';
import { WorkshopIncidentEvent } from '../types';
export { formatDateTime, formatSeconds } from './date';
export { STATE_LABELS, STATUS_LABELS } from './labels';

export type HistoryPeriod = 'today' | '7d' | '30d' | 'lifetime' | 'custom';

export const EVENT_LABELS: Record<string, string> = {
  INCIDENT_CREATED: 'Signalement créé',
  EDIT_REQUESTED: 'Correction demandée',
  EDIT_APPLIED: 'Correction appliquée',
  EDIT_REJECTED: 'Correction refusée',
  DELETE_REQUESTED: 'Annulation demandée',
  DELETE_REQUEST_REJECTED: 'Annulation refusée',
  CANCEL_REQUESTED: 'Annulation demandée',
  CANCEL_REQUEST_REJECTED: 'Annulation refusée',
  INCIDENT_CANCELED: 'Signalement annulé',
  INCIDENT_INVALIDATED: 'Cas clôturé invalidé',
  INCIDENT_TAKEN: 'Prise en charge',
  STATUS_CHANGED: 'Changement de statut',
  PRIORITY_CHANGED: 'Priorité modifiée',
  ORDER_CHANGED: 'Réordonnancement',
  RESPONSIBLE_COMMENT_UPDATED: 'Consigne responsable',
  INCIDENT_UPDATED: 'Incident modifié',
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

  if (event.event_type === 'STATUS_CHANGED' && payload.from && payload.to) {
    return `${STATUS_LABELS[String(payload.from)] || payload.from} -> ${
      STATUS_LABELS[String(payload.to)] || payload.to
    }`;
  }
  if (event.event_type === 'PRIORITY_CHANGED') {
    if (payload.value !== undefined) return payload.value ? 'Urgent' : 'Normal';
    if (payload.to !== undefined) return payload.to ? 'Urgent' : 'Normal';
  }
  if (event.event_type === 'ORDER_CHANGED' && payload.from !== undefined && payload.to !== undefined) {
    return `position ${payload.from} -> ${payload.to}`;
  }
  if (event.event_type === 'INCIDENT_UPDATED' && Array.isArray(payload.changedFields)) {
    return `champs modifiés: ${payload.changedFields.join(', ')}`;
  }
  if (event.event_type === 'RESPONSIBLE_COMMENT_UPDATED') return 'consigne mise à jour';
  if (event.event_type === 'INCIDENT_INVALIDATED') return 'retiré des statistiques et de la connaissance';
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
