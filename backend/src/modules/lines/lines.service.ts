import { isDeepStrictEqual } from 'node:util';
import { ServiceResult } from '../../utils/serviceResult';
import { isPostgresError } from '../../utils/postgresError';
import { withTransaction } from '../../db/transaction';
import { createLineAuditEvent } from './lines.events';
import { getLineEventType, hasStructuralLineChanges } from './lines.policy';
import {
  cancelActiveIncidentsByLine,
  createLineData,
  findMachineConflicts,
  getActiveIncidentCountForLine,
  getLineData,
  getLineForUpdate,
  getLineImpactData,
  LineDto,
  LineImpactDto,
  lineNumberExists,
  listLinesData,
  softDeleteLine,
  updateLineData,
} from './lines.repository';
import { logIncidentEvent } from '../workshop/workshop.events';
import { supersedeOpenArbitrationCases } from '../workshop/workshop.arbitration.repository';
import { CreateLineInput, UpdateLineInput } from './lines.validation';
import { formatCount } from '../../utils/french';

const lineNumberConstraints = new Set([
  'idx_production_lines_line_number_active',
  'idx_production_lines_normalized_number_active',
]);
const machineConstraints = new Set([
  'production_line_machines_line_id_normalized_machine_id_key',
  'idx_production_line_machines_global_id',
]);

function lineAlreadyExists(): ServiceResult<never> {
  return {
    ok: false,
    status: 409,
    code: 'LINE_ALREADY_EXISTS',
    message: 'Ce numéro de ligne est déjà utilisé.',
  };
}

function machineAlreadyExists(): ServiceResult<never> {
  return {
    ok: false,
    status: 409,
    code: 'MACHINE_ALREADY_EXISTS',
    message: 'Un ou plusieurs IDs machine existent déjà.',
  };
}

function mapLineWriteConflict(error: unknown): ServiceResult<never> | null {
  if (!isPostgresError(error) || error.code !== '23505' || !error.constraint) return null;
  if (lineNumberConstraints.has(error.constraint)) return lineAlreadyExists();
  if (machineConstraints.has(error.constraint)) return machineAlreadyExists();
  return null;
}

function effectiveLineUpdates(
  current: {
    line_number: string;
    is_active: boolean;
    machine_sequence: unknown;
  },
  requested: UpdateLineInput
): UpdateLineInput {
  const effective: UpdateLineInput = {};
  if (requested.lineNumber !== undefined && requested.lineNumber !== current.line_number) {
    effective.lineNumber = requested.lineNumber;
  }
  if (requested.isActive !== undefined && requested.isActive !== current.is_active) {
    effective.isActive = requested.isActive;
  }
  if (
    requested.machines !== undefined &&
    !isDeepStrictEqual(requested.machines, current.machine_sequence)
  ) {
    effective.machines = requested.machines;
  }
  return effective;
}

export async function listLinesService(): Promise<LineDto[]> {
  return listLinesData();
}

export async function checkLineAvailabilityService(
  lineNumber: string
): Promise<{ exists: boolean }> {
  return { exists: await lineNumberExists(lineNumber) };
}

export async function checkLineConflictsService(
  lineNumber: string,
  machineIds: string[],
  lineId?: number
): Promise<{ lineExists: boolean; machineConflicts: string[] }> {
  const [machineConflicts, lineExists] = await Promise.all([
    findMachineConflicts(machineIds, lineId),
    lineNumberExists(lineNumber, lineId),
  ]);

  return { lineExists, machineConflicts };
}

export async function createLineService(
  input: CreateLineInput,
  adminId: number
): Promise<ServiceResult<LineDto>> {
  try {
    const result = await withTransaction(async (client) => {
      if (await lineNumberExists(input.lineNumber, undefined, client)) {
        return { kind: 'line_conflict' as const };
      }

      const machineConflicts = await findMachineConflicts(
        input.machines.map((item) => item.machineId),
        undefined,
        client
      );
      if (machineConflicts.length > 0) return { kind: 'machine_conflict' as const };

      const created = await createLineData(input, client);
      await createLineAuditEvent(
        created.id,
        adminId,
        'LINE_CREATED',
        {
          lineNumber: input.lineNumber,
          machinesCount: input.machines.length,
          isActive: input.isActive ?? true,
        },
        client
      );
      return { kind: 'ok' as const, line: created };
    });

    if (result.kind === 'line_conflict') return lineAlreadyExists();
    if (result.kind === 'machine_conflict') return machineAlreadyExists();
    return { ok: true, data: result.line };
  } catch (error) {
    const conflict = mapLineWriteConflict(error);
    if (conflict) return conflict;
    throw error;
  }
}

export async function getLineService(id: number): Promise<ServiceResult<LineDto>> {
  const line = await getLineData(id);
  if (!line) {
    return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Ligne introuvable.' };
  }

  return { ok: true, data: line };
}

export async function updateLineService(
  id: number,
  updates: UpdateLineInput,
  adminId: number
): Promise<ServiceResult<LineDto>> {
  try {
    const result = await withTransaction(async (client) => {
      const current = await getLineForUpdate(id, client);
      if (!current) return { kind: 'not_found' as const };

      const effective = effectiveLineUpdates(current, updates);
      if (Object.keys(effective).length === 0) {
        const unchanged = await getLineData(id, client);
        return unchanged
          ? { kind: 'ok' as const, line: unchanged }
          : { kind: 'not_found' as const };
      }

      if (hasStructuralLineChanges(effective)) {
        const activeIncidents = await getActiveIncidentCountForLine(id, client);
        if (activeIncidents > 0) {
          return { kind: 'in_use' as const, activeIncidents };
        }
      }

      if (
        effective.lineNumber !== undefined &&
        (await lineNumberExists(effective.lineNumber, id, client))
      ) {
        return { kind: 'line_conflict' as const };
      }

      if (effective.machines !== undefined) {
        const machineConflicts = await findMachineConflicts(
          effective.machines.map((item) => item.machineId),
          id,
          client
        );
        if (machineConflicts.length > 0) return { kind: 'machine_conflict' as const };
      }

      const eventType = getLineEventType(current, effective);
      const updated = await updateLineData(id, effective, client);
      if (!updated) return { kind: 'not_found' as const };
      await createLineAuditEvent(id, adminId, eventType, effective, client);
      return { kind: 'ok' as const, line: updated };
    });

    if (result.kind === 'not_found') {
      return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Ligne introuvable.' };
    }
    if (result.kind === 'line_conflict') return lineAlreadyExists();
    if (result.kind === 'machine_conflict') return machineAlreadyExists();
    if (result.kind === 'in_use') {
      // Le compteur public passe par `details.count` : le frontend reconstruit
      // le message précis à partir du CODE (C-03), sans rendre ce `message` brut.
      return {
        ok: false,
        status: 409,
        code: 'RESOURCE_IN_USE',
        message: `Impossible de modifier la structure de cette ligne : ${formatCount(
          result.activeIncidents,
          'incident actif y est encore lié',
          'incidents actifs y sont encore liés'
        )}.`,
        details: { reason: 'LINE_STRUCTURE_LOCKED', count: result.activeIncidents },
      };
    }
    return { ok: true, data: result.line };
  } catch (error) {
    const conflict = mapLineWriteConflict(error);
    if (conflict) return conflict;
    throw error;
  }
}

export async function archiveLineService(
  id: number,
  adminId: number,
  force = false
): Promise<ServiceResult<{ message: string; canceledIncidents?: number }>> {
  const result = await withTransaction(async (client) => {
    const line = await getLineForUpdate(id, client);
    if (!line) return { kind: 'not_found' as const };
    const activeCount = await getActiveIncidentCountForLine(id, client);
    if (activeCount > 0 && !force) {
      return { kind: 'in_use' as const, activeCount };
    }

    let canceledCount = 0;
    if (force && activeCount > 0) {
      const canceledIds = await cancelActiveIncidentsByLine(id, client);
      canceledCount = canceledIds.length;
      await supersedeOpenArbitrationCases(canceledIds, 'Archivage forcé de la ligne', client);
      for (const incidentId of canceledIds) {
        await logIncidentEvent(
          incidentId,
          { kind: 'ADMIN', adminId },
          'INCIDENT_CANCELED',
          { reason: 'line_archived', lineNumber: line.line_number },
          client
        );
      }
    }
    const ok = await softDeleteLine(id, client);
    if (!ok) return { kind: 'not_found' as const };
    await createLineAuditEvent(
      id,
      adminId,
      'LINE_SOFT_DELETED',
      { forcedCanceledIncidents: canceledCount },
      client
    );
    return { kind: 'ok' as const, canceledCount };
  });

  if (result.kind === 'not_found') {
    return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Ligne introuvable.' };
  }
  if (result.kind === 'in_use') {
    return {
      ok: false,
      status: 409,
      code: 'LINE_HAS_ACTIVE_INCIDENTS',
      message: `Cette ligne a ${formatCount(
        result.activeCount,
        'incident actif',
        'incidents actifs'
      )}. Annulez-les d'abord ou forcez l'archivage.`,
    };
  }

  return {
    ok: true,
    data: {
      message:
        result.canceledCount > 0
          ? `Ligne archivée. ${formatCount(
              result.canceledCount,
              'incident actif annulé',
              'incidents actifs annulés'
            )}.`
          : 'Ligne archivée.',
      canceledIncidents: result.canceledCount,
    },
  };
}

export async function getLineImpactService(id: number): Promise<LineImpactDto> {
  return getLineImpactData(id);
}
