import { api } from './client';
import { buildQuery } from '../utils/query';
import {
  IncidentState,
  ProductionLine,
  WorkshopHistoryEvent,
  WorkshopIncident,
  WorkshopIncidentEvent,
  WorkshopIncidentMetrics,
  WorkshopAnalytics,
} from '../types';

export interface CreateIncidentPayload {
  lineId: number;
  machineId: string;
  robotLabel: string;
  headNumber: number;
  state: IncidentState;
  comment?: string;
  currentProduct: string;
}

export async function listWorkshopLines(): Promise<ProductionLine[]> {
  return api.get<ProductionLine[]>('/api/workshop/lines');
}

export async function listWorkshopIncidents(): Promise<WorkshopIncident[]> {
  return api.get<WorkshopIncident[]>('/api/workshop/incidents');
}

export type IncidentWorkspaceParams = {
  q?: string;
  status?: 'OPEN' | 'PENDING' | 'CLOSED' | 'CANCELED' | 'INVALIDATED';
  state?: IncidentState;
  lineId?: number;
  machineId?: string;
  eventType?: string;
  limit?: number;
};

export async function listWorkshopHistoryIncidents(
  params: IncidentWorkspaceParams = {}
): Promise<WorkshopIncident[]> {
  return api.get<WorkshopIncident[]>(`/api/workshop/history/incidents${buildQuery(params)}`);
}

export async function getWorkshopHistoryIncident(id: number): Promise<WorkshopIncident> {
  return api.get<WorkshopIncident>(`/api/workshop/history/incidents/${id}`);
}

export async function listWorkshopHistoryEvents(
  params: IncidentWorkspaceParams = {}
): Promise<WorkshopHistoryEvent[]> {
  return api.get<WorkshopHistoryEvent[]>(`/api/workshop/history/events${buildQuery(params)}`);
}

export async function listWorkshopKnowledgeIncidents(
  params: IncidentWorkspaceParams = {}
): Promise<WorkshopIncident[]> {
  return api.get<WorkshopIncident[]>(`/api/workshop/knowledge/incidents${buildQuery(params)}`);
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
  status?: 'OPEN' | 'PENDING' | 'CLOSED' | 'CANCELED' | 'INVALIDATED';
  diagnostic?: string;
  interventionNote?: string;
  responsibleComment?: string;
  requestOnly?: boolean;
  cancelRequest?: boolean;
  cancelRequestReason?: string;
  deleteRequest?: boolean;
  deleteRequestReason?: string;
  invalidationReason?: string;
  applyEditRequest?: boolean;
  rejectEditRequest?: boolean;
  rejectDeleteRequest?: boolean;
  withdrawEditRequest?: boolean;
};

export async function updateWorkshopIncident(
  id: number,
  payload: UpdateIncidentPayload
): Promise<WorkshopIncident> {
  return api.patch<WorkshopIncident>(`/api/workshop/incidents/${id}`, payload);
}

export async function followWorkshopIncident(id: number): Promise<WorkshopIncident> {
  return api.post<WorkshopIncident>(`/api/workshop/incidents/${id}/follow`, {});
}

export async function unfollowWorkshopIncident(id: number): Promise<WorkshopIncident> {
  return api.delete<WorkshopIncident>(`/api/workshop/incidents/${id}/follow`);
}

export type ArbitrationConsultationRequestType = 'EDIT' | 'CANCEL' | 'ALL';

export async function consultWorkshopArbitration(
  id: number,
  requestType: ArbitrationConsultationRequestType = 'ALL'
): Promise<{ consulted: number; incident: WorkshopIncident }> {
  return api.post<{ consulted: number; incident: WorkshopIncident }>(
    `/api/workshop/incidents/${id}/arbitration-consultation`,
    { requestType }
  );
}

export async function cancelWorkshopIncident(id: number): Promise<void> {
  return api.post<void>(`/api/workshop/incidents/${id}/cancel`, {});
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
  return api.get<WorkshopAnalytics>(`/api/workshop/analytics${buildQuery(params)}`);
}
