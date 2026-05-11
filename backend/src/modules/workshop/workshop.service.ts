import { badRequest, forbidden, notFound, ServiceResult } from '../../utils/serviceResult';
import { logIncidentEvent } from './workshop.events';
import { canPerform } from './workshop.policy';
import * as workshopRepository from './workshop.repository';
import { CreateIncidentInput, UpdateIncidentInput } from './workshop.validation';

function requestedChangeKeys(changes: Record<string, unknown> | null | undefined): string[] {
  if (!changes) return [];
  return Object.keys(changes).filter((key) => changes[key] !== undefined);
}

function getRobotOptions(machine: workshopRepository.StoredMachine): { label: string; heads: number }[] {
  if (machine.hasDoubleRobot) {
    return [
      { label: `Gauche ${machine.leftRobotNumber}`, heads: machine.leftRobotHeads },
      { label: `Droite ${machine.rightRobotNumber}`, heads: machine.rightRobotHeads },
    ];
  }

  return [{ label: machine.robotNumber, heads: machine.robotHeads }];
}

export async function validateIncidentSelectionService(data: {
  lineId?: number;
  machineId?: string;
  robotLabel?: string;
  headNumber?: number;
}): Promise<{ lineNumber: string; machineBrand: string } | null> {
  if (!data.lineId || !data.machineId || !data.robotLabel || !data.headNumber) return null;

  const line = await workshopRepository.getActiveWorkshopLine(data.lineId);
  if (!line) return null;

  const machine = line.machines.find((item) => item.machineId === data.machineId);
  if (!machine) return null;

  const robot = getRobotOptions(machine).find((item) => item.label === data.robotLabel);
  if (!robot || data.headNumber < 1 || data.headNumber > robot.heads) return null;

  return { lineNumber: line.line_number, machineBrand: machine.brand };
}

export async function getBoardDataService() {
  return workshopRepository.getBoardData();
}

export async function listWorkshopLinesService() {
  return workshopRepository.listActiveWorkshopLines();
}

export async function listIncidentsService() {
  return workshopRepository.listIncidents();
}

export async function listHistoryIncidentsService(query: Record<string, unknown>) {
  return workshopRepository.listIncidentWorkspaceRows(query, 'history');
}

export async function getHistoryIncidentService(id: number): Promise<ServiceResult<unknown>> {
  const incident = await workshopRepository.fetchIncidentWithUsers(id);
  if (!incident) {
    return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Incident introuvable.' };
  }

  return { ok: true, data: incident };
}

export async function listKnowledgeIncidentsService(query: Record<string, unknown>) {
  return workshopRepository.listIncidentWorkspaceRows(query, 'knowledge');
}

export async function getKnowledgeIncidentService(id: number): Promise<ServiceResult<unknown>> {
  const incident = await workshopRepository.fetchIncidentWithUsers(id);
  if (
    !incident ||
    incident.status !== 'CLOSED' ||
    !incident.intervention_note ||
    !String(incident.intervention_note).trim()
  ) {
    return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Fiche connaissance introuvable.' };
  }

  return { ok: true, data: incident };
}

export async function listHistoryEventsService(query: Record<string, unknown>) {
  return workshopRepository.listHistoryEvents(query);
}

export async function listIncidentEventsService(id: number) {
  return workshopRepository.listIncidentEvents(id);
}

export async function getIncidentMetricsService() {
  return workshopRepository.getIncidentMetrics();
}

export async function getWorkshopAnalyticsService(query: Record<string, unknown>) {
  return workshopRepository.getWorkshopAnalytics(query);
}

export async function createIncidentService(
  data: CreateIncidentInput,
  actorUserId: number
): Promise<ServiceResult<unknown>> {
  const line = await workshopRepository.getActiveWorkshopLine(data.lineId);
  if (!line) {
    return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Ligne introuvable ou inactive.' };
  }

  const machine = line.machines.find((item) => item.machineId === data.machineId);
  if (!machine) {
    return { ok: false, status: 400, code: 'VALIDATION_ERROR', message: 'Machine invalide pour cette ligne.' };
  }

  const robot = getRobotOptions(machine).find((item) => item.label === data.robotLabel);
  if (!robot) {
    return { ok: false, status: 400, code: 'VALIDATION_ERROR', message: 'Robot invalide pour cette machine.' };
  }
  if (data.headNumber < 1 || data.headNumber > robot.heads) {
    return { ok: false, status: 400, code: 'VALIDATION_ERROR', message: 'Tête invalide pour ce robot.' };
  }

  const incidentId = await workshopRepository.createIncidentData({
    actorUserId,
    data,
    line,
    machine,
    robotLabel: robot.label,
  });

  await logIncidentEvent(incidentId, actorUserId, 'INCIDENT_CREATED', {
    shift: data.shift,
    lineNumber: line.line_number,
    machineId: machine.machineId,
    robotLabel: robot.label,
    headNumber: data.headNumber,
    state: data.state,
    hasComment: Boolean(data.comment?.trim()),
    hasCurrentProduct: Boolean(data.currentProduct?.trim()),
  });

  return { ok: true, data: await workshopRepository.fetchIncidentWithUsers(incidentId) };
}

export async function deleteIncidentService(
  incidentId: number,
  actorUserId: number,
  actorRole: string
): Promise<ServiceResult<{ message: string }>> {
  const incident = await workshopRepository.getIncidentCancelSnapshot(incidentId);
  if (!incident) {
    return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Incident introuvable.' };
  }

  const action = actorRole === 'RESPONSABLE' && incident.delete_request
    ? 'APPROVE_CANCEL'
    : 'CANCEL';
  if (!canPerform(actorRole, action, incident)) {
    return {
      ok: false,
      status: 403,
      code: 'FORBIDDEN',
      message: 'Annulation non autorisée pour ce rôle ou ce statut.',
    };
  }

  if (!(await workshopRepository.cancelIncidentData(incidentId))) {
    return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Incident introuvable.' };
  }

  await logIncidentEvent(incidentId, actorUserId, 'INCIDENT_CANCELED', {
    mode: action === 'APPROVE_CANCEL' ? 'request_approved' : 'direct',
    requestedReason: incident.delete_request_reason,
    previousStatus: incident.status,
  });

  return { ok: true, data: { message: 'Incident annulé.' } };
}

export async function updateIncidentService(
  id: number,
  updates: UpdateIncidentInput,
  actorUserId: number,
  actorRole: string
): Promise<ServiceResult<unknown>> {
  const current = await workshopRepository.getIncidentById(id);
  if (!current) {
    return notFound('Incident introuvable.');
  }

  const role = actorRole;

  if (updates.deleteRequest) {
    if (!canPerform(role, 'REQUEST_CANCEL', current)) {
      return forbidden('Demande d’annulation non autorisée pour ce rôle ou ce statut.');
    }
    if (!updates.deleteRequestReason?.trim()) {
      return badRequest('Motif obligatoire pour l’annulation.');
    }
    const incidentId = await workshopRepository.requestCancelIncident(id, updates.deleteRequestReason.trim());
    await logIncidentEvent(id, actorUserId, 'CANCEL_REQUESTED', {
      reason: updates.deleteRequestReason.trim(),
      status: current.status,
    });
    return { ok: true, data: await workshopRepository.fetchIncidentWithUsers(incidentId) };
  }

  if (role === 'OPERATOR') {
    if (updates.requestOnly) {
      if (!canPerform(role, 'REQUEST_EDIT', current)) {
        return forbidden('Demande de correction non autorisée pour ce statut.');
      }
      const { requestOnly, deleteRequest, deleteRequestReason, ...editPayload } = updates;
      if (Object.keys(editPayload).length === 0) {
        return badRequest('Aucune modification demandée.');
      }
      const incidentId = await workshopRepository.requestEditIncident(id, editPayload);
      await logIncidentEvent(id, actorUserId, 'EDIT_REQUESTED', {
        changes: editPayload,
        fields: requestedChangeKeys(editPayload),
      });
      return { ok: true, data: await workshopRepository.fetchIncidentWithUsers(incidentId) };
    }
    return forbidden('Modification directe non autorisée pour ce rôle.');
  }

  if (updates.rejectEditRequest) {
    if (!canPerform(role, 'REJECT_EDIT', current)) {
      return forbidden('Seul le responsable peut refuser une correction.');
    }
    const incidentId = await workshopRepository.rejectEditIncident(id);
    await logIncidentEvent(id, actorUserId, 'EDIT_REJECTED', {
      rejectedFields: requestedChangeKeys(current.edit_request as Record<string, unknown> | null),
    });
    return { ok: true, data: await workshopRepository.fetchIncidentWithUsers(incidentId) };
  }

  if (updates.rejectDeleteRequest) {
    if (!canPerform(role, 'REJECT_CANCEL', current)) {
      return forbidden('Seul le responsable peut refuser une annulation.');
    }
    const incidentId = await workshopRepository.rejectCancelIncident(id);
    await logIncidentEvent(id, actorUserId, 'CANCEL_REQUEST_REJECTED', {
      requestedReason: current.delete_request_reason,
    });
    return { ok: true, data: await workshopRepository.fetchIncidentWithUsers(incidentId) };
  }

  if (updates.applyEditRequest) {
    if (!canPerform(role, 'APPROVE_EDIT', current)) {
      return forbidden('Seul le responsable peut appliquer une correction.');
    }
    if (!current.edit_request) {
      return badRequest('Aucune demande de modification à appliquer.');
    }
    const requested = current.edit_request as Record<string, unknown>;
    const requestedShift = (requested.shift as string | undefined) ?? current.shift;
    const requestedLineId = (requested.lineId as number | undefined) ?? current.line_id;
    const requestedMachineId = (requested.machineId as string | undefined) ?? current.machine_id;
    const requestedRobotLabel = (requested.robotLabel as string | undefined) ?? current.robot_label;
    const requestedHeadNumber = (requested.headNumber as number | undefined) ?? current.head_number;
    const selection = await validateIncidentSelectionService({
      lineId: requestedLineId,
      machineId: requestedMachineId,
      robotLabel: requestedRobotLabel,
      headNumber: requestedHeadNumber,
    });
    if (!selection) {
      return badRequest('Sélection ligne/machine/robot/tête invalide.');
    }

    const incidentId = await workshopRepository.applyEditRequestIncident({
      incidentId: id,
      current,
      requested,
      selection,
    });
    await logIncidentEvent(id, actorUserId, 'EDIT_APPLIED', {
      changes: requested,
      fields: requestedChangeKeys(requested),
    });
    return { ok: true, data: await workshopRepository.fetchIncidentWithUsers(incidentId) };
  }

  if (updates.isTaken !== undefined && !canPerform(role, 'TAKE', current)) {
    return forbidden('Prise en charge non autorisée pour ce rôle ou ce statut.');
  }
  if (updates.isPriority !== undefined && !canPerform(role, 'SET_PRIORITY', current)) {
    return forbidden('Seul le responsable peut modifier la priorité d’un incident actif.');
  }
  if (updates.displayOrder !== undefined && !canPerform(role, 'REORDER', current)) {
    return forbidden('Seul le responsable peut réordonner un incident actif.');
  }
  if (updates.responsibleComment !== undefined && !canPerform(role, 'RESPONSIBLE_COMMENT', current)) {
    return forbidden('Seul le responsable peut gérer la consigne.');
  }
  if (updates.status === 'CANCELED') {
    if (!canPerform(role, 'INVALIDATE_CLOSED', current)) {
      return forbidden('Seul le responsable peut invalider un cas clôturé.');
    }
    if (!updates.invalidationReason?.trim()) {
      return badRequest('Motif obligatoire pour l’invalidation.');
    }
    const incidentId = await workshopRepository.invalidateIncident(id);
    await logIncidentEvent(id, actorUserId, 'INCIDENT_INVALIDATED', {
      reason: updates.invalidationReason.trim(),
      previousStatus: current.status,
    });
    return { ok: true, data: await workshopRepository.fetchIncidentWithUsers(incidentId) };
  }
  if (updates.status === 'PENDING' && !canPerform(role, 'SET_PENDING', current)) {
    return forbidden('Mise en attente non autorisée pour ce rôle ou ce statut.');
  }
  if (updates.status === 'OPEN' && current.status === 'PENDING' && !canPerform(role, 'RESUME', current)) {
    return forbidden('Reprise non autorisée pour ce rôle ou ce statut.');
  }
  if (updates.status === 'CLOSED' && !canPerform(role, 'CLOSE', current)) {
    return forbidden('Clôture non autorisée pour ce rôle ou ce statut.');
  }
  if (updates.status === 'PENDING' && !updates.diagnostic && !current.diagnostic) {
    return badRequest('Diagnostic obligatoire avant mise en attente.');
  }
  if (updates.status === 'CLOSED' && current.status === 'PENDING') {
    return badRequest('Impossible de clôturer un incident en attente.');
  }
  if (updates.status === 'CLOSED' && !updates.interventionNote && !current.intervention_note) {
    return badRequest('Documentation intervention obligatoire avant clôture.');
  }

  const editingFieldsTouched =
    updates.shift !== undefined ||
    updates.lineId !== undefined ||
    updates.machineId !== undefined ||
    updates.robotLabel !== undefined ||
    updates.headNumber !== undefined ||
    updates.state !== undefined ||
    updates.comment !== undefined ||
    updates.currentProduct !== undefined;

  if (editingFieldsTouched && !canPerform(role, 'DIRECT_EDIT', current)) {
    return forbidden('Modification directe non autorisée pour ce rôle ou ce statut.');
  }

  const tookOwnership = updates.isTaken === true && !current.is_taken;
  const statusChanged = updates.status !== undefined && updates.status !== current.status;
  const priorityChanged = updates.isPriority !== undefined && updates.isPriority !== current.is_priority;
  const orderChanged = updates.displayOrder !== undefined && updates.displayOrder !== current.display_order;
  const responsibleChanged =
    role === 'RESPONSABLE' && updates.responsibleComment !== undefined &&
    updates.responsibleComment !== current.responsible_comment;
  const directChanges: Record<string, { old: unknown; new: unknown }> = {};

  const lineId = updates.lineId ?? current.line_id;
  const machineId = updates.machineId ?? current.machine_id;
  const robotLabel = updates.robotLabel ?? current.robot_label;
  const headNumber = updates.headNumber ?? current.head_number;
  const selection = await validateIncidentSelectionService({ lineId, machineId, robotLabel, headNumber });
  if (!selection) {
    return badRequest('Sélection ligne/machine/robot/tête invalide.');
  }

  if (updates.shift !== undefined && updates.shift !== current.shift) {
    directChanges.shift = { old: current.shift, new: updates.shift };
  }
  if (updates.lineId !== undefined && updates.lineId !== current.line_id) {
    directChanges.lineId = { old: current.line_id, new: lineId };
    directChanges.lineNumber = { old: current.line_number, new: selection.lineNumber };
  }
  if (updates.machineId !== undefined && updates.machineId !== current.machine_id) {
    directChanges.machineId = { old: current.machine_id, new: machineId };
    directChanges.machineBrand = { old: current.machine_brand, new: selection.machineBrand };
  }
  if (updates.robotLabel !== undefined && updates.robotLabel !== current.robot_label) {
    directChanges.robotLabel = { old: current.robot_label, new: robotLabel };
  }
  if (updates.headNumber !== undefined && updates.headNumber !== current.head_number) {
    directChanges.headNumber = { old: current.head_number, new: headNumber };
  }
  if (updates.state !== undefined && updates.state !== current.state) {
    directChanges.state = { old: current.state, new: updates.state };
  }
  if (updates.comment !== undefined && updates.comment !== current.comment) {
    directChanges.comment = { old: current.comment, new: updates.comment };
  }
  if (updates.currentProduct !== undefined && updates.currentProduct !== current.current_product) {
    directChanges.currentProduct = { old: current.current_product, new: updates.currentProduct };
  }

  const incidentId = await workshopRepository.updateIncidentData({
    incidentId: id,
    current,
    updates,
    role,
    actorUserId,
    selection,
    lineId,
    machineId,
    robotLabel,
    headNumber,
  });
  if (tookOwnership) {
    await logIncidentEvent(id, actorUserId, 'INCIDENT_TAKEN', {
      previousTakenByUserId: current.taken_by_user_id,
    });
  }
  if (statusChanged) {
    await logIncidentEvent(id, actorUserId, 'STATUS_CHANGED', {
      from: current.status,
      to: updates.status,
      diagnostic: updates.status === 'PENDING' ? updates.diagnostic ?? current.diagnostic : undefined,
      interventionNote: updates.status === 'CLOSED' ? updates.interventionNote ?? current.intervention_note : undefined,
    });
  }
  if (priorityChanged) {
    await logIncidentEvent(id, actorUserId, 'PRIORITY_CHANGED', {
      from: current.is_priority,
      to: updates.isPriority,
    });
  }
  if (orderChanged) {
    await logIncidentEvent(id, actorUserId, 'ORDER_CHANGED', {
      from: current.display_order,
      to: updates.displayOrder,
    });
  }
  if (responsibleChanged) {
    await logIncidentEvent(id, actorUserId, 'RESPONSIBLE_COMMENT_UPDATED', {
      from: current.responsible_comment,
      to: updates.responsibleComment,
    });
  }
  if (editingFieldsTouched) {
    await logIncidentEvent(id, actorUserId, 'INCIDENT_UPDATED', {
      changes: directChanges,
      fields: Object.keys(directChanges),
    });
  }

  return { ok: true, data: await workshopRepository.fetchIncidentWithUsers(incidentId) };
}
