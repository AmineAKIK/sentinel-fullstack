import { api } from './client';
import { ReferenceAuditEvent, ReferenceDashboard, ReferenceQuality } from '../types';

export async function getReferenceDashboard(): Promise<ReferenceDashboard> {
  return api.get<ReferenceDashboard>('/api/admin/dashboard');
}

export async function getReferenceQuality(): Promise<ReferenceQuality> {
  return api.get<ReferenceQuality>('/api/admin/quality');
}

export interface ReferenceAuditParams {
  scope?: string;
  taskGroup?: string;
  q?: string;
  start?: string;
  end?: string;
  order?: 'asc' | 'desc';
  limit?: number;
}

export async function listReferenceAudit(params: ReferenceAuditParams = {}): Promise<ReferenceAuditEvent[]> {
  const queryParams = new URLSearchParams();
  queryParams.set('scope', params.scope || 'all');
  queryParams.set('limit', String(params.limit || 250));
  if (params.taskGroup && params.taskGroup !== 'all') queryParams.set('taskGroup', params.taskGroup);
  if (params.q) queryParams.set('q', params.q);
  if (params.start) queryParams.set('start', params.start);
  if (params.end) queryParams.set('end', params.end);
  if (params.order) queryParams.set('order', params.order);
  const query = queryParams.toString();
  return api.get<ReferenceAuditEvent[]>(`/api/admin/audit?${query}`);
}
