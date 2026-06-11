import { api } from './client';
import { ReferenceAuditEvent, ReferenceDashboard, ReferenceQuality } from '../types';
import { buildQuery } from '../utils/query';

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
  return api.get<ReferenceAuditEvent[]>(`/api/admin/audit${buildQuery({
    scope: params.scope || 'all',
    limit: params.limit || 250,
    taskGroup: params.taskGroup && params.taskGroup !== 'all' ? params.taskGroup : undefined,
    q: params.q,
    start: params.start,
    end: params.end,
    order: params.order,
  })}`);
}
