import { api } from './client';
import { ReferenceAuditEvent, ReferenceDashboard, ReferenceQuality } from '../types';
import { buildQuery } from '../utils/query';

export async function getReferenceDashboard(signal?: AbortSignal): Promise<ReferenceDashboard> {
  return api.get<ReferenceDashboard>('/api/admin/dashboard', signal);
}

export async function getReferenceQuality(signal?: AbortSignal): Promise<ReferenceQuality> {
  return api.get<ReferenceQuality>('/api/admin/quality', signal);
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

export interface PasswordResetRequest {
  id: number;
  user_id: number;
  first_name: string;
  last_name: string;
  badge_number: string;
  requested_at: string;
}

export async function listPendingPasswordResetRequests(
  signal?: AbortSignal
): Promise<PasswordResetRequest[]> {
  return api.get<PasswordResetRequest[]>('/api/admin/password-reset-requests', signal);
}

export async function markPasswordResetRequestHandled(id: number): Promise<void> {
  await api.patch(`/api/admin/password-reset-requests/${id}/handle`);
}

export async function listReferenceAudit(
  params: ReferenceAuditParams = {},
  signal?: AbortSignal
): Promise<ReferenceAuditEvent[]> {
  return api.get<ReferenceAuditEvent[]>(
    `/api/admin/audit${buildQuery({
      scope: params.scope || 'all',
      limit: params.limit || 250,
      taskGroup: params.taskGroup && params.taskGroup !== 'all' ? params.taskGroup : undefined,
      q: params.q,
      start: params.start,
      end: params.end,
      order: params.order,
    })}`,
    signal
  );
}
