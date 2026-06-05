import { ServiceResult } from '../../utils/serviceResult';
import { withTransaction } from '../../db/transaction';
import { createLineAuditEvent } from './lines.events';
import { getLineEventType } from './lines.policy';
import {
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
import { CreateLineInput, UpdateLineInput } from './lines.validation';

export async function listLinesService(): Promise<LineDto[]> {
  return listLinesData();
}

export async function checkLineAvailabilityService(lineNumber: string): Promise<{ exists: boolean }> {
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

export async function createLineService(input: CreateLineInput, adminId: number): Promise<ServiceResult<LineDto>> {
  if (await lineNumberExists(input.lineNumber)) {
    return { ok: false, status: 409, code: 'LINE_ALREADY_EXISTS', message: 'Ce numéro de ligne est déjà utilisé.' };
  }

  const machineConflicts = await findMachineConflicts(input.machines.map((item) => item.machineId));
  if (machineConflicts.length > 0) {
    return { ok: false, status: 409, code: 'MACHINE_ALREADY_EXISTS', message: 'Un ou plusieurs IDs machine existent déjà.' };
  }

  const line = await withTransaction(async (client) => {
    const created = await createLineData(input, client);
    await createLineAuditEvent(created.id, adminId, 'LINE_CREATED', {
      lineNumber: input.lineNumber,
      machinesCount: input.machines.length,
      isActive: input.isActive ?? true,
    }, client);
    return created;
  });

  return { ok: true, data: line };
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
  if (updates.lineNumber && await lineNumberExists(updates.lineNumber, id)) {
    return { ok: false, status: 409, code: 'LINE_ALREADY_EXISTS', message: 'Ce numéro de ligne est déjà utilisé.' };
  }

  const current = await getLineForUpdate(id);
  if (!current) {
    return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Ligne introuvable.' };
  }

  if (updates.machines !== undefined) {
    const machineConflicts = await findMachineConflicts(
      updates.machines.map((item) => item.machineId),
      id
    );
    if (machineConflicts.length > 0) {
      return { ok: false, status: 409, code: 'MACHINE_ALREADY_EXISTS', message: 'Un ou plusieurs IDs machine existent déjà.' };
    }
  }

  if (updates.isActive !== undefined && current.is_active && updates.isActive === false) {
    const activeIncidents = await getActiveIncidentCountForLine(id);
    if (activeIncidents > 0) {
      return {
        ok: false,
        status: 409,
        code: 'RESOURCE_IN_USE',
        message: `Impossible de désactiver cette ligne : ${activeIncidents} incident(s) actif(s) y sont encore liés.`,
      };
    }
  }

  const eventType = getLineEventType(current, updates);

  const line = await withTransaction(async (client) => {
    const updated = await updateLineData(id, updates, client);
    if (!updated) return null;
    await createLineAuditEvent(id, adminId, eventType, updates as Record<string, unknown>, client);
    return updated;
  });

  if (!line) {
    return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Ligne introuvable.' };
  }

  return { ok: true, data: line };
}

export async function deleteLineService(id: number, adminId: number): Promise<ServiceResult<{ message: string }>> {
  const activeIncidents = await getActiveIncidentCountForLine(id);
  if (activeIncidents > 0) {
    return {
      ok: false,
      status: 409,
      code: 'RESOURCE_IN_USE',
      message: `Impossible de supprimer cette ligne : ${activeIncidents} incident(s) actif(s) y sont encore liés.`,
    };
  }

  const deleted = await withTransaction(async (client) => {
    const ok = await softDeleteLine(id, client);
    if (!ok) return false;
    await createLineAuditEvent(id, adminId, 'LINE_SOFT_DELETED', null, client);
    return true;
  });

  if (!deleted) {
    return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Ligne introuvable.' };
  }

  return { ok: true, data: { message: 'Ligne supprimée.' } };
}

export async function getLineImpactService(id: number): Promise<LineImpactDto> {
  return getLineImpactData(id);
}
