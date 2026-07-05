import { boundedInt } from '../../db/sql';
import {
  getReferenceDashboardData,
  getReferenceQualityRawData,
  listReferenceAuditData,
  listPendingPasswordResetRequestsData,
  markPasswordResetRequestHandledData,
  ListReferenceAuditFilters,
  ReferenceAuditEventDto,
  ReferenceDashboardDto,
  ReferenceQualityDto,
  PasswordResetRequestDto,
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
    // Borne alignée sur la limite du frontend (AdminAuditPage LIMIT = 1000) :
    // si elles divergent, l'avertissement de troncature ne se déclenche jamais.
    limit: boundedInt(query.limit, 100, 1, 1000),
  };
}

export async function getReferenceDashboardService(): Promise<ReferenceDashboardDto> {
  return getReferenceDashboardData();
}

export async function getReferenceQualityService(): Promise<ReferenceQualityDto> {
  const raw = await getReferenceQualityRawData();

  const malformedMachines: ReferenceQualityDto['malformed_machines'] = [];
  const machineOwners = new Map<string, string[]>();

  for (const line of raw.all_lines) {
    const machines = Array.isArray(line.machines) ? line.machines : [];

    if (line.is_active && machines.length === 0) {
      malformedMachines.push({
        line_id: line.id,
        line_number: line.line_number,
        machine_id: '-',
        issue: 'Ligne active sans machine',
      });
    }

    for (const machine of machines) {
      const machineId = String(machine.machineId || '').trim();
      const hasMissingFields = !machineId || !String(machine.brand || '').trim();

      if (hasMissingFields) {
        malformedMachines.push({
          line_id: line.id,
          line_number: line.line_number,
          machine_id: machineId || '-',
          issue: 'Machine incomplète',
        });
      }

      if (machineId) {
        const key = machineId.toLowerCase();
        machineOwners.set(key, [...(machineOwners.get(key) ?? []), line.line_number]);
      }
    }
  }

  const duplicateMachines = Array.from(machineOwners.entries())
    .filter(([, owners]) => owners.length > 1)
    .map(([machine_id, line_numbers]) => ({ machine_id, line_numbers }));

  return {
    users_without_password: raw.users_without_password,
    inactive_users: raw.inactive_users,
    inactive_lines: raw.inactive_lines,
    malformed_machines: malformedMachines,
    duplicate_machines: duplicateMachines,
  };
}

export async function listReferenceAuditService(query: ReferenceAuditQuery): Promise<ReferenceAuditEventDto[]> {
  return listReferenceAuditData(normalizeReferenceAuditFilters(query));
}

export async function listPendingPasswordResetRequestsService(): Promise<PasswordResetRequestDto[]> {
  return listPendingPasswordResetRequestsData();
}

export async function markPasswordResetRequestHandledService(id: number): Promise<boolean> {
  return markPasswordResetRequestHandledData(id);
}
