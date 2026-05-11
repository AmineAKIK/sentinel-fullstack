import { boundedInt } from '../../db/sql';
import {
  getReferenceDashboardData,
  getReferenceQualityData,
  listReferenceAuditData,
  ListReferenceAuditFilters,
  ReferenceAuditEventDto,
  ReferenceDashboardDto,
  ReferenceQualityDto,
} from './admin.repository';

export interface ReferenceAuditQuery {
  scope?: unknown;
  taskGroup?: unknown;
  q?: unknown;
  start?: unknown;
  end?: unknown;
  order?: unknown;
  limit?: unknown;
}

function normalizeReferenceAuditFilters(query: ReferenceAuditQuery): ListReferenceAuditFilters {
  return {
    scope: String(query.scope || 'all'),
    taskGroup: String(query.taskGroup || 'all'),
    q: String(query.q || '').trim(),
    start: String(query.start || '').trim(),
    end: String(query.end || '').trim(),
    order: query.order === 'asc' ? 'ASC' : 'DESC',
    limit: boundedInt(query.limit, 100, 1, 250),
  };
}

export async function getReferenceDashboardService(): Promise<ReferenceDashboardDto> {
  return getReferenceDashboardData();
}

export async function getReferenceQualityService(): Promise<ReferenceQualityDto> {
  return getReferenceQualityData();
}

export async function listReferenceAuditService(query: ReferenceAuditQuery): Promise<ReferenceAuditEventDto[]> {
  return listReferenceAuditData(normalizeReferenceAuditFilters(query));
}
