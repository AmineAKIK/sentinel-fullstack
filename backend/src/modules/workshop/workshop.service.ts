import { badRequest, forbidden, notFound, ServiceResult } from '../../utils/serviceResult';
import { withTransaction } from '../../db/transaction';
import { logIncidentEvent, IncidentEventType } from './workshop.events';
import { canPerform } from './workshop.policy';
import * as workshopRepository from './workshop.repository';
import { CreateIncidentInput, UpdateIncidentInput } from './workshop.validation';
import type { ReorderIncidentsInput } from './workshop.validation';

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

async function fetchIncidentForActor(incidentId: number, actorUserId: number) {
  return workshopRepository.fetchIncidentWithUsersForActor(incidentId, actorUserId);
}

async function autoFollowForResponsable(
  incidentId: number,
  actorUserId: number,
  actorRole: string,
  client: Parameters<typeof workshopRepository.followIncidentData>[2]
): Promise<void> {
  if (actorRole !== 'RESPONSABLE') return;
  await workshopRepository.followIncidentData(incidentId, actorUserId, client);
}

export async function listIncidentsService(userId: number, role: string) {
  return workshopRepository.listIncidents(userId, role);
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

export async function getIncidentMetricsService(userId: number) {
  return workshopRepository.getIncidentMetrics(userId);
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

  const incidentId = await withTransaction(async (client) => {
    const id = await workshopRepository.createIncidentData({
      actorUserId,
      data,
      line,
      machine,
      robotLabel: robot.label,
    }, client);
    await logIncidentEvent(id, actorUserId, 'INCIDENT_CREATED', {
      shift: data.shift,
      lineNumber: line.line_number,
      machineId: machine.machineId,
      robotLabel: robot.label,
      headNumber: data.headNumber,
      state: data.state,
      hasComment: Boolean(data.comment?.trim()),
      hasCurrentProduct: Boolean(data.currentProduct?.trim()),
    }, client);
    return id;
  });

  return { ok: true, data: await fetchIncidentForActor(incidentId, actorUserId) };
}

export async function followIncidentService(
  incidentId: number,
  actorUserId: number,
  actorRole: string
): Promise<ServiceResult<unknown>> {
  if (actorRole !== 'RESPONSABLE') {
    return forbidden('Seul le responsable peut suivre un incident.');
  }
  if (!(await workshopRepository.incidentExists(incidentId))) {
    return notFound('Incident introuvable.');
  }

  await withTransaction(async (client) => {
    await workshopRepository.followIncidentData(incidentId, actorUserId, client);
    await logIncidentEvent(incidentId, actorUserId, 'INCIDENT_FOLLOWED', {}, client);
  });

  return { ok: true, data: await fetchIncidentForActor(incidentId, actorUserId) };
}

export async function unfollowIncidentService(
  incidentId: number,
  actorUserId: number,
  actorRole: string
): Promise<ServiceResult<unknown>> {
  if (actorRole !== 'RESPONSABLE') {
    return forbidden('Seul le responsable peut retirer un suivi.');
  }
  if (!(await workshopRepository.incidentExists(incidentId))) {
    return notFound('Incident introuvable.');
  }

  await withTransaction(async (client) => {
    await workshopRepository.unfollowIncidentData(incidentId, actorUserId, client);
    await logIncidentEvent(incidentId, actorUserId, 'INCIDENT_UNFOLLOWED', {}, client);
  });

  return { ok: true, data: await fetchIncidentForActor(incidentId, actorUserId) };
}

export async function cancelIncidentService(
  incidentId: number,
  actorUserId: number,
  actorRole: string
): Promise<ServiceResult<{ message: string }>> {
  const result = await withTransaction(async (client) => {
    const incident = await workshopRepository.getIncidentCancelSnapshot(incidentId, client);
    if (!incident) return { kind: 'not_found' as const };

    const action = actorRole === 'RESPONSABLE' && canPerform(actorRole, 'APPROVE_CANCEL', incident)
      ? 'APPROVE_CANCEL'
      : 'CANCEL';
    if (!canPerform(actorRole, action, incident)) {
      return { kind: 'forbidden' as const };
    }
    const ok = await workshopRepository.cancelIncidentData(incidentId, client);
    if (!ok) return { kind: 'not_found' as const };
    await logIncidentEvent(incidentId, actorUserId, 'INCIDENT_CANCELED', {
      mode: action === 'APPROVE_CANCEL' ? 'request_approved' : 'direct',
      requestedReason: incident.cancel_request_reason ?? incident.delete_request_reason,
      previousStatus: incident.status,
    }, client);
    return { kind: 'ok' as const };
  });

  if (result.kind === 'not_found') {
    return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Incident introuvable.' };
  }
  if (result.kind === 'forbidden') {
    return {
      ok: false,
      status: 403,
      code: 'FORBIDDEN',
      message: 'Annulation non autorisée pour ce rôle ou ce statut.',
    };
  }

  return { ok: true, data: { message: 'Incident annulé.' } };
}

export async function updateIncidentService(
  id: number,
  updates: UpdateIncidentInput,
  actorUserId: number,
  actorRole: string
): Promise<ServiceResult<unknown>> {
  const current = await workshopRepository.getIncidentById(id);
  if (!current) return notFound('Incident introuvable.');

  const wantsCancelRequest = updates.cancelRequest === true || updates.deleteRequest === true;
  const cancelRequestReason = updates.cancelRequestReason ?? updates.deleteRequestReason;

  if (wantsCancelRequest) {
    if (!canPerform(actorRole, 'REQUEST_CANCEL', current)) {
      return forbidden(`Demande d'annulation non autorisée pour ce rôle ou ce statut.`);
    }
    if (!cancelRequestReason?.trim()) {
      return badRequest(`Motif obligatoire pour l'annulation.`);
    }
    const incidentId = await withTransaction(async (client) => {
      const locked = await workshopRepository.getIncidentById(id, client);
      if (!locked) return null;
      if (!canPerform(actorRole, 'REQUEST_CANCEL', locked)) return 'forbidden';
      const rid = await workshopRepository.requestCancelIncident(id, cancelRequestReason.trim(), client);
      if (!rid) return null;
      await logIncidentEvent(id, actorUserId, 'CANCEL_REQUESTED', {
        reason: cancelRequestReason.trim(),
        status: locked.status,
      }, client);
      return rid;
    });
    if (incidentId === 'forbidden') return forbidden(`Demande d'annulation non autorisée pour ce rôle ou ce statut.`);
    if (!incidentId) return notFound('Incident introuvable.');
    return { ok: true, data: await fetchIncidentForActor(incidentId, actorUserId) };
  }

  if (actorRole === 'OPERATOR') {
    if (updates.requestOnly) {
      if (!canPerform(actorRole, 'REQUEST_EDIT', current)) {
        return forbidden(`Demande de correction non autorisée pour ce statut.`);
      }
      const {
        requestOnly,
        deleteRequest,
        deleteRequestReason,
        cancelRequest,
        cancelRequestReason,
        ...editPayload
      } = updates;
      if (Object.keys(editPayload).length === 0) {
        return badRequest('Aucune modification demandée.');
      }
      const incidentId = await withTransaction(async (client) => {
        const rid = await workshopRepository.requestEditIncident(id, editPayload, client);
        if (!rid) return null;
        await logIncidentEvent(id, actorUserId, 'EDIT_REQUESTED', {
          changes: editPayload,
          fields: requestedChangeKeys(editPayload),
        }, client);
        return rid;
      });
      if (!incidentId) return notFound('Incident introuvable.');
      return { ok: true, data: await fetchIncidentForActor(incidentId, actorUserId) };
    }
    return forbidden(`Modification directe non autorisée pour ce rôle.`);
  }

  if (updates.rejectEditRequest) {
    if (!canPerform(actorRole, 'REJECT_EDIT', current)) {
      return forbidden(`Seul le responsable peut refuser une correction.`);
    }
    if (!current.edit_request) {
      return badRequest('Aucune demande de modification à refuser.');
    }
    const incidentId = await withTransaction(async (client) => {
      const rid = await workshopRepository.rejectEditIncident(id, client);
      if (!rid) return null;
      await logIncidentEvent(id, actorUserId, 'EDIT_REJECTED', {
        rejectedFields: requestedChangeKeys(current.edit_request as Record<string, unknown> | null),
      }, client);
      return rid;
    });
    if (!incidentId) return notFound('Incident introuvable.');
    return { ok: true, data: await fetchIncidentForActor(incidentId, actorUserId) };
  }

  if (updates.rejectDeleteRequest) {
    if (!canPerform(actorRole, 'REJECT_CANCEL', current)) {
      return forbidden(`Seul le responsable peut refuser une annulation.`);
    }
    if (!current.cancel_request) {
      return badRequest(`Aucune demande d'annulation à refuser.`);
    }
    const incidentId = await withTransaction(async (client) => {
      const rid = await workshopRepository.rejectCancelIncident(id, client);
      if (!rid) return null;
      await logIncidentEvent(id, actorUserId, 'CANCEL_REQUEST_REJECTED', {
        requestedReason: current.cancel_request_reason,
      }, client);
      return rid;
    });
    if (!incidentId) return notFound('Incident introuvable.');
    return { ok: true, data: await fetchIncidentForActor(incidentId, actorUserId) };
  }

  if (updates.applyEditRequest) {
    if (!canPerform(actorRole, 'APPROVE_EDIT', current)) {
      return forbidden(`Seul le responsable peut appliquer une correction.`);
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

    const incidentId = await withTransaction(async (client) => {
      const rid = await workshopRepository.applyEditRequestIncident({
        incidentId: id,
        current,
        requested,
        selection,
      }, client);
      if (!rid) return null;
      await logIncidentEvent(id, actorUserId, 'EDIT_APPLIED', {
        changes: requested,
        fields: requestedChangeKeys(requested),
      }, client);
      await autoFollowForResponsable(id, actorUserId, actorRole, client);
      return rid;
    });
    if (!incidentId) return notFound('Incident introuvable.');
    return { ok: true, data: await fetchIncidentForActor(incidentId, actorUserId) };
  }

  if (updates.isTaken !== undefined && !canPerform(actorRole, 'TAKE', current)) {
    return forbidden(`Prise en charge non autorisée pour ce rôle ou ce statut.`);
  }
  if (updates.isPriority !== undefined && !canPerform(actorRole, 'SET_PRIORITY', current)) {
    return forbidden(`Seul le responsable peut modifier la priorité d'un incident actif.`);
  }
  if (updates.displayOrder !== undefined && !canPerform(actorRole, 'REORDER', current)) {
    return forbidden(`Seul le responsable peut réordonner un incident actif.`);
  }
  if (updates.responsibleComment !== undefined && !canPerform(actorRole, 'RESPONSIBLE_COMMENT', current)) {
    return forbidden(`Seul le responsable peut gérer la consigne.`);
  }
  if (updates.status === 'INVALIDATED' || (updates.status === 'CANCELED' && current.status === 'CLOSED')) {
    if (!canPerform(actorRole, 'INVALIDATE_CLOSED', current)) {
      return forbidden(`Seul le responsable peut invalider un cas clôturé.`);
    }
    if (!updates.invalidationReason?.trim()) {
      return badRequest(`Motif obligatoire pour l'invalidation.`);
    }
    const incidentId = await withTransaction(async (client) => {
      const rid = await workshopRepository.invalidateIncident(id, client);
      if (!rid) return null;
      await logIncidentEvent(id, actorUserId, 'INCIDENT_INVALIDATED', {
        reason: updates.invalidationReason!.trim(),
        previousStatus: current.status,
      }, client);
      await autoFollowForResponsable(id, actorUserId, actorRole, client);
      return rid;
    });
    if (!incidentId) return notFound('Incident introuvable.');
    return { ok: true, data: await fetchIncidentForActor(incidentId, actorUserId) };
  }
  if (updates.status === 'PENDING' && !canPerform(actorRole, 'SET_PENDING', current)) {
    return forbidden(`Mise en attente non autorisée pour ce rôle ou ce statut.`);
  }
  if (updates.status === 'OPEN' && current.status === 'PENDING' && !canPerform(actorRole, 'RESUME', current)) {
    return forbidden(`Reprise non autorisée pour ce rôle ou ce statut.`);
  }
  if (updates.status === 'CLOSED' && !canPerform(actorRole, 'CLOSE', current)) {
    return forbidden(`Clôture non autorisée pour ce rôle ou ce statut.`);
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

  if (editingFieldsTouched &&
      !canPerform(actorRole, 'DIRECT_EDIT', current) &&
      !canPerform(actorRole, 'EDIT_AFTER_TAKE', current, actorUserId)) {
    return forbidden(`Modification directe non autorisée pour ce rôle ou ce statut.`);
  }

  const tookOwnership = updates.isTaken === true && !current.is_taken;
  const statusChanged = updates.status !== undefined && updates.status !== current.status;
  const priorityChanged = updates.isPriority !== undefined && updates.isPriority !== current.is_priority;
  const orderChanged = updates.displayOrder !== undefined && updates.displayOrder !== current.display_order;
  const responsibleChanged =
    actorRole === 'RESPONSABLE' && updates.responsibleComment !== undefined &&
    updates.responsibleComment !== current.responsible_comment;
  const directChanges: Record<string, { old: unknown; new: unknown }> = {};

  const lineId = updates.lineId ?? current.line_id;
  const machineId = updates.machineId ?? current.machine_id;
  const robotLabel = updates.robotLabel ?? current.robot_label;
  const headNumber = updates.headNumber ?? current.head_number;

  let selection: { lineNumber: string; machineBrand: string } | null = null;
  if (editingFieldsTouched) {
    selection = await validateIncidentSelectionService({ lineId, machineId, robotLabel, headNumber });
    if (!selection) {
      return badRequest('Sélection ligne/machine/robot/tête invalide.');
    }
  } else {
    selection = { lineNumber: current.line_number, machineBrand: current.machine_brand };
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

  const incidentId = await withTransaction(async (client) => {
    const rid = await workshopRepository.updateIncidentData({
      incidentId: id,
      current,
      updates,
      role: actorRole,
      actorUserId,
      selection,
      lineId,
      machineId,
      robotLabel,
      headNumber,
    }, client);
    if (!rid) return null;
    if (tookOwnership) {
      await logIncidentEvent(id, actorUserId, 'INCIDENT_TAKEN', {
        previousTakenByUserId: current.taken_by_user_id,
      }, client);
    }
    if (statusChanged) {
      const statusEventType: IncidentEventType =
        updates.status === 'PENDING' ? 'INCIDENT_SET_PENDING' :
        updates.status === 'OPEN' ? 'INCIDENT_RESUMED' :
        updates.status === 'CLOSED' ? 'INCIDENT_CLOSED' :
        'STATUS_CHANGED';
      await logIncidentEvent(id, actorUserId, statusEventType, {
        from: current.status,
        to: updates.status,
        diagnostic: updates.status === 'PENDING' ? updates.diagnostic ?? current.diagnostic : undefined,
        interventionNote: updates.status === 'CLOSED' ? updates.interventionNote ?? current.intervention_note : undefined,
      }, client);
    }
    if (priorityChanged) {
      await logIncidentEvent(id, actorUserId, 'PRIORITY_CHANGED', {
        from: current.is_priority,
        to: updates.isPriority,
      }, client);
      await autoFollowForResponsable(id, actorUserId, actorRole, client);
    }
    if (orderChanged) {
      await logIncidentEvent(id, actorUserId, 'ORDER_CHANGED', {
        from: current.display_order,
        to: updates.displayOrder,
      }, client);
    }
    if (responsibleChanged) {
      await logIncidentEvent(id, actorUserId, 'RESPONSIBLE_COMMENT_UPDATED', {
        from: current.responsible_comment,
        to: updates.responsibleComment,
      }, client);
      await autoFollowForResponsable(id, actorUserId, actorRole, client);
    }
    if (editingFieldsTouched) {
      await logIncidentEvent(id, actorUserId, 'INCIDENT_UPDATED', {
        changes: directChanges,
        fields: Object.keys(directChanges),
      }, client);
    }
    return rid;
  });
  if (!incidentId) return notFound('Incident introuvable.');

  return { ok: true, data: await fetchIncidentForActor(incidentId, actorUserId) };
}

export async function reorderIncidentsService(
  input: ReorderIncidentsInput,
  actorUserId: number,
  actorRole: string
): Promise<ServiceResult<{ updated: number }>> {
  if (actorRole !== 'RESPONSABLE') {
    return forbidden('Seul le responsable peut réordonner les incidents.');
  }
  const uniqueIds = [...new Set(input.orderedIncidentIds)];
  if (uniqueIds.length !== input.orderedIncidentIds.length) {
    return badRequest('La liste de réordonnancement contient des doublons.');
  }

  const updated = await withTransaction(async (client) => {
    const count = await workshopRepository.reorderIncidentsData(uniqueIds, client);
    await Promise.all(uniqueIds.map((incidentId, index) =>
      logIncidentEvent(incidentId, actorUserId, 'INCIDENT_REORDERED', {
        position: index + 1,
        batchSize: uniqueIds.length,
      }, client)
    ));
    return count;
  });

  return { ok: true, data: { updated } };
}
