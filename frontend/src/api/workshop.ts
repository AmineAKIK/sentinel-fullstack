import { api } from './client';
import {
  IncidentShift,
  IncidentState,
  ProductionLine,
  WorkshopBoardData,
  WorkshopHistoryEvent,
  WorkshopIncident,
  WorkshopIncidentEvent,
  WorkshopIncidentMetrics,
  WorkshopAnalytics,
} from '../types';

export interface CreateIncidentPayload {
  shift: IncidentShift;
  lineId: number;
  machineId: string;
  robotLabel: string;
  headNumber: number;
  state: IncidentState;
  comment?: string;
  currentProduct?: string;
}

export async function listWorkshopLines(): Promise<ProductionLine[]> {
  return api.get<ProductionLine[]>('/api/workshop/lines');
}

export async function getWorkshopBoardData(): Promise<WorkshopBoardData> {
  return api.get<WorkshopBoardData>('/api/workshop/board');
}

export async function listWorkshopIncidents(): Promise<WorkshopIncident[]> {
  return api.get<WorkshopIncident[]>('/api/workshop/incidents');
}

export type IncidentWorkspaceParams = {
  q?: string;
  status?: 'OPEN' | 'PENDING' | 'CLOSED' | 'CANCELED';
  state?: IncidentState;
  lineId?: number;
  machineId?: string;
  eventType?: string;
  limit?: number;
};

function buildIncidentWorkspaceQuery(params: IncidentWorkspaceParams): string {
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.status) query.set('status', params.status);
  if (params.state) query.set('state', params.state);
  if (params.lineId) query.set('lineId', String(params.lineId));
  if (params.machineId) query.set('machineId', params.machineId);
  if (params.eventType) query.set('eventType', params.eventType);
  if (params.limit) query.set('limit', String(params.limit));
  const suffix = query.toString();
  return suffix ? `?${suffix}` : '';
}

export async function listWorkshopHistoryIncidents(
  params: IncidentWorkspaceParams = {}
): Promise<WorkshopIncident[]> {
  return api.get<WorkshopIncident[]>(`/api/workshop/history/incidents${buildIncidentWorkspaceQuery(params)}`);
}

export async function getWorkshopHistoryIncident(id: number): Promise<WorkshopIncident> {
  return api.get<WorkshopIncident>(`/api/workshop/history/incidents/${id}`);
}

export async function listWorkshopHistoryEvents(
  params: IncidentWorkspaceParams = {}
): Promise<WorkshopHistoryEvent[]> {
  return api.get<WorkshopHistoryEvent[]>(`/api/workshop/history/events${buildIncidentWorkspaceQuery(params)}`);
}

export async function listWorkshopKnowledgeIncidents(
  params: IncidentWorkspaceParams = {}
): Promise<WorkshopIncident[]> {
  return api.get<WorkshopIncident[]>(`/api/workshop/knowledge/incidents${buildIncidentWorkspaceQuery(params)}`);
}

export async function getWorkshopKnowledgeIncident(id: number): Promise<WorkshopIncident> {
  return api.get<WorkshopIncident>(`/api/workshop/knowledge/incidents/${id}`);
}

export async function createWorkshopIncident(
  payload: CreateIncidentPayload
): Promise<WorkshopIncident> {
  return api.post<WorkshopIncident>('/api/workshop/incidents', payload);
}

export type UpdateIncidentPayload = Partial<CreateIncidentPayload> & {
  isTaken?: boolean;
  isPriority?: boolean;
  displayOrder?: number;
  status?: 'OPEN' | 'PENDING' | 'CLOSED' | 'CANCELED';
  diagnostic?: string;
  interventionNote?: string;
  responsibleComment?: string;
  requestOnly?: boolean;
  deleteRequest?: boolean;
  deleteRequestReason?: string;
  invalidationReason?: string;
  applyEditRequest?: boolean;
  rejectEditRequest?: boolean;
  rejectDeleteRequest?: boolean;
};

export async function updateWorkshopIncident(
  id: number,
  payload: UpdateIncidentPayload
): Promise<WorkshopIncident> {
  return api.patch<WorkshopIncident>(`/api/workshop/incidents/${id}`, payload);
}

export async function deleteWorkshopIncident(id: number): Promise<void> {
  return api.delete<void>(`/api/workshop/incidents/${id}`);
}

export async function listIncidentEvents(id: number): Promise<WorkshopIncidentEvent[]> {
  return api.get<WorkshopIncidentEvent[]>(`/api/workshop/incidents/${id}/events`);
}

export async function getIncidentMetrics(): Promise<WorkshopIncidentMetrics> {
  return api.get<WorkshopIncidentMetrics>('/api/workshop/metrics');
}

export type AnalyticsParams = {
  start?: string;
  end?: string;
  lineId?: number;
  machineId?: string;
};

export async function getWorkshopAnalytics(params: AnalyticsParams): Promise<WorkshopAnalytics> {
  const query = new URLSearchParams();
  if (params.start) query.set('start', params.start);
  if (params.end) query.set('end', params.end);
  if (params.lineId) query.set('lineId', String(params.lineId));
  if (params.machineId) query.set('machineId', params.machineId);
  const suffix = query.toString();
  return api.get<WorkshopAnalytics>(`/api/workshop/analytics${suffix ? `?${suffix}` : ''}`);
}
