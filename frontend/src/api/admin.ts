import { api } from './client';
import { ReferenceAuditEvent, ReferenceDashboard, ReferenceQuality } from '../types';

export async function getReferenceDashboard(): Promise<ReferenceDashboard> {
  return api.get<ReferenceDashboard>('/api/admin/dashboard');
}

export async function getReferenceQuality(): Promise<ReferenceQuality> {
  return api.get<ReferenceQuality>('/api/admin/quality');
}

export async function listReferenceAudit(scope = 'all'): Promise<ReferenceAuditEvent[]> {
  const query = new URLSearchParams({ scope, limit: '250' }).toString();
  return api.get<ReferenceAuditEvent[]>(`/api/admin/audit?${query}`);
}
