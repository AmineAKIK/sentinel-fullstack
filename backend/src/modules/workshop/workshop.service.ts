import { badRequest, forbidden, notFound, ServiceResult } from '../../utils/serviceResult';
import { withTransaction } from '../../db/transaction';
import { logIncidentEvent, IncidentEventType } from './workshop.events';
import { canPerform } from './workshop.policy';
import * as workshopRepository from './workshop.repository';
import { CreateIncidentInput, UpdateIncidentInput } from './workshop.validation';
import type { ReorderIncidentsInput } from './workshop.validation';

// ─── Helpers internes ─────────────────────────────────────────────────────────

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

// ─── Validation sélection ligne/machine/robot ─────────────────────────────────

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

// ─── Lecture / board / lignes ─────────────────────────────────────────────────

export async function getBoardDataService() {
  return workshopRepository.getBoardData();
}

export async function listWorkshopLinesService() {
  return workshopRepository.listActiveWorkshopLines();
}

export async function listIncidentsService(userId: number, role: string) {
  return workshopRepository.listIncidents(userId, role);
}

export async function listHistoryIncidentsService(query: Record<string, unknown>) {
  return workshopRepository.listIncidentWorkspaceRows(query, 'history');
}

export async function getHistoryIncidentService(id: number): Promise<ServiceResult<unknown>> {
  const incident = await workshopRepository.fetchIncidentWithUsers(id);
  if (!incident) return notFound('Incident introuvable.');
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
    return notFound('Fiche connaissance introuvable.');
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

// ─── Création ─────────────────────────────────────────────────────────────────

export async function createIncidentService(
  data: CreateIncidentInput,
  actorUserId: number
): Promise<ServiceResult<unknown>> {
  const line = await workshopRepository.getActiveWorkshopLine(data.lineId);
  if (!line) return notFound('Ligne introuvable ou inactive.');

  const machine = line.machines.find((item) => item.machineId === data.machineId);
  if (!machine) return badRequest('Machine invalide pour cette ligne.');

  const robot = getRobotOptions(machine).find((item) => item.label === data.robotLabel);
  if (!robot) return badRequest('Robot invalide pour cette machine.');
  if (data.headNumber < 1 || data.headNumber > robot.heads) return badRequest('Tête invalide pour ce robot.');

  const incidentId = await withTransaction(async (client) => {
    const id = await workshopRepository.createIncidentData({ actorUserId, data, line, machine, robotLabel: robot.label }, client);
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

// ─── Prise en charge (TAKE) ───────────────────────────────────────────────────

export async function takeIncidentService(
  incidentId: number,
  actorUserId: number,
  actorRole: string
): Promise<ServiceResult<unknown>> {
  const current = await workshopRepository.getIncidentById(incidentId);
  if (!current) return notFound('Incident introuvable.');
  if (!canPerform(actorRole, 'TAKE', current)) {
    return forbidden('Prise en charge non autorisée pour ce rôle ou ce statut.');
  }

  const rid = await withTransaction(async (client) => {
    const id = await workshopRepository.updateIncidentData({
      incidentId, current,
      updates: { isTaken: true },
      role: actorRole, actorUserId,
      selection: { lineNumber: current.line_number, machineBrand: current.machine_brand },
      lineId: current.line_id, machineId: current.machine_id,
      robotLabel: current.robot_label, headNumber: current.head_number,
    }, client);
    if (!id) return null;
    await logIncidentEvent(incidentId, actorUserId, 'INCIDENT_TAKEN', {
      previousTakenByUserId: current.taken_by_user_id,
    }, client);
    return id;
  });

  if (!rid) return notFound('Incident introuvable.');
  return { ok: true, data: await fetchIncidentForActor(rid, actorUserId) };
}

// ─── Mise en attente (SET_PENDING) ────────────────────────────────────────────

export async function setPendingIncidentService(
  incidentId: number,
  diagnostic: string | undefined,
  actorUserId: number,
  actorRole: string
): Promise<ServiceResult<unknown>> {
  const current = await workshopRepository.getIncidentById(incidentId);
  if (!current) return notFound('Incident introuvable.');
  if (!canPerform(actorRole, 'SET_PENDING', current)) {
    return forbidden('Mise en attente non autorisée pour ce rôle ou ce statut.');
  }
  if (!diagnostic?.trim() && !current.diagnostic) {
    return badRequest('Diagnostic obligatoire avant mise en attente.');
  }

  const rid = await withTransaction(async (client) => {
    const id = await workshopRepository.updateIncidentData({
      incidentId, current,
      updates: { status: 'PENDING', diagnostic },
      role: actorRole, actorUserId,
      selection: { lineNumber: current.line_number, machineBrand: current.machine_brand },
      lineId: current.line_id, machineId: current.machine_id,
      robotLabel: current.robot_label, headNumber: current.head_number,
    }, client);
    if (!id) return null;
    await logIncidentEvent(incidentId, actorUserId, 'INCIDENT_SET_PENDING', {
      from: current.status,
      to: 'PENDING',
      diagnostic: diagnostic ?? current.diagnostic,
    }, client);
    return id;
  });

  if (!rid) return notFound('Incident introuvable.');
  return { ok: true, data: await fetchIncidentForActor(rid, actorUserId) };
}

// ─── Reprise (RESUME) ─────────────────────────────────────────────────────────

export async function resumeIncidentService(
  incidentId: number,
  actorUserId: number,
  actorRole: string
): Promise<ServiceResult<unknown>> {
  const current = await workshopRepository.getIncidentById(incidentId);
  if (!current) return notFound('Incident introuvable.');
  if (!canPerform(actorRole, 'RESUME', current)) {
    return forbidden('Reprise non autorisée pour ce rôle ou ce statut.');
  }

  const rid = await withTransaction(async (client) => {
    const id = await workshopRepository.updateIncidentData({
      incidentId, current,
      updates: { status: 'OPEN' },
      role: actorRole, actorUserId,
      selection: { lineNumber: current.line_number, machineBrand: current.machine_brand },
      lineId: current.line_id, machineId: current.machine_id,
      robotLabel: current.robot_label, headNumber: current.head_number,
    }, client);
    if (!id) return null;
    await logIncidentEvent(incidentId, actorUserId, 'INCIDENT_RESUMED', {
      from: 'PENDING',
      to: 'OPEN',
    }, client);
    return id;
  });

  if (!rid) return notFound('Incident introuvable.');
  return { ok: true, data: await fetchIncidentForActor(rid, actorUserId) };
}

// ─── Clôture (CLOSE) ─────────────────────────────────────────────────────────

export async function closeIncidentService(
  incidentId: number,
  interventionNote: string | undefined,
  actorUserId: number,
  actorRole: string
): Promise<ServiceResult<unknown>> {
  const current = await workshopRepository.getIncidentById(incidentId);
  if (!current) return notFound('Incident introuvable.');
  if (!canPerform(actorRole, 'CLOSE', current)) {
    return forbidden('Clôture non autorisée pour ce rôle ou ce statut.');
  }
  if (current.status === 'PENDING') {
    return badRequest('Impossible de clôturer un incident en attente.');
  }
  if (!interventionNote?.trim() && !current.intervention_note) {
    return badRequest('Documentation intervention obligatoire avant clôture.');
  }

  const rid = await withTransaction(async (client) => {
    const id = await workshopRepository.updateIncidentData({
      incidentId, current,
      updates: { status: 'CLOSED', interventionNote },
      role: actorRole, actorUserId,
      selection: { lineNumber: current.line_number, machineBrand: current.machine_brand },
      lineId: current.line_id, machineId: current.machine_id,
      robotLabel: current.robot_label, headNumber: current.head_number,
    }, client);
    if (!id) return null;
    await logIncidentEvent(incidentId, actorUserId, 'INCIDENT_CLOSED', {
      from: current.status,
      to: 'CLOSED',
      interventionNote: interventionNote ?? current.intervention_note,
    }, client);
    return id;
  });

  if (!rid) return notFound('Incident introuvable.');
  return { ok: true, data: await fetchIncidentForActor(rid, actorUserId) };
}

// ─── Invalidation (INVALIDATE_CLOSED) ────────────────────────────────────────

export async function invalidateIncidentService(
  incidentId: number,
  invalidationReason: string | undefined,
  actorUserId: number,
  actorRole: string
): Promise<ServiceResult<unknown>> {
  const current = await workshopRepository.getIncidentById(incidentId);
  if (!current) return notFound('Incident introuvable.');
  if (!canPerform(actorRole, 'INVALIDATE_CLOSED', current)) {
    return forbidden('Seul le responsable peut invalider un cas clôturé.');
  }
  if (!invalidationReason?.trim()) {
    return badRequest("Motif obligatoire pour l'invalidation.");
  }

  const rid = await withTransaction(async (client) => {
    const id = await workshopRepository.invalidateIncident(incidentId, client);
    if (!id) return null;
    await logIncidentEvent(incidentId, actorUserId, 'INCIDENT_INVALIDATED', {
      reason: invalidationReason.trim(),
      previousStatus: current.status,
    }, client);
    await autoFollowForResponsable(incidentId, actorUserId, actorRole, client);
    return id;
  });

  if (!rid) return notFound('Incident introuvable.');
  return { ok: true, data: await fetchIncidentForActor(rid, actorUserId) };
}

// ─── Modification directe (DIRECT_EDIT / EDIT_AFTER_TAKE) ────────────────────

export async function editIncidentService(
  incidentId: number,
  updates: Pick<UpdateIncidentInput, 'shift' | 'lineId' | 'machineId' | 'robotLabel' | 'headNumber' | 'state' | 'comment' | 'currentProduct'>,
  actorUserId: number,
  actorRole: string
): Promise<ServiceResult<unknown>> {
  const current = await workshopRepository.getIncidentById(incidentId);
  if (!current) return notFound('Incident introuvable.');

  if (
    !canPerform(actorRole, 'DIRECT_EDIT', current) &&
    !canPerform(actorRole, 'EDIT_AFTER_TAKE', current, actorUserId)
  ) {
    return forbidden('Modification directe non autorisée pour ce rôle ou ce statut.');
  }

  const lineId = updates.lineId ?? current.line_id;
  const machineId = updates.machineId ?? current.machine_id;
  const robotLabel = updates.robotLabel ?? current.robot_label;
  const headNumber = updates.headNumber ?? current.head_number;

  const selection = await validateIncidentSelectionService({ lineId, machineId, robotLabel, headNumber });
  if (!selection) return badRequest('Sélection ligne/machine/robot/tête invalide.');

  const directChanges: Record<string, { old: unknown; new: unknown }> = {};
  if (updates.shift !== undefined && updates.shift !== current.shift) directChanges.shift = { old: current.shift, new: updates.shift };
  if (updates.lineId !== undefined && updates.lineId !== current.line_id) { directChanges.lineId = { old: current.line_id, new: lineId }; directChanges.lineNumber = { old: current.line_number, new: selection.lineNumber }; }
  if (updates.machineId !== undefined && updates.machineId !== current.machine_id) { directChanges.machineId = { old: current.machine_id, new: machineId }; directChanges.machineBrand = { old: current.machine_brand, new: selection.machineBrand }; }
  if (updates.robotLabel !== undefined && updates.robotLabel !== current.robot_label) directChanges.robotLabel = { old: current.robot_label, new: robotLabel };
  if (updates.headNumber !== undefined && updates.headNumber !== current.head_number) directChanges.headNumber = { old: current.head_number, new: headNumber };
  if (updates.state !== undefined && updates.state !== current.state) directChanges.state = { old: current.state, new: updates.state };
  if (updates.comment !== undefined && updates.comment !== current.comment) directChanges.comment = { old: current.comment, new: updates.comment };
  if (updates.currentProduct !== undefined && updates.currentProduct !== current.current_product) directChanges.currentProduct = { old: current.current_product, new: updates.currentProduct };

  const rid = await withTransaction(async (client) => {
    const id = await workshopRepository.updateIncidentData({
      incidentId, current, updates, role: actorRole, actorUserId, selection, lineId, machineId, robotLabel, headNumber,
    }, client);
    if (!id) return null;
    await logIncidentEvent(incidentId, actorUserId, 'INCIDENT_UPDATED', {
      changes: directChanges,
      fields: Object.keys(directChanges),
    }, client);
    return id;
  });

  if (!rid) return notFound('Incident introuvable.');
  return { ok: true, data: await fetchIncidentForActor(rid, actorUserId) };
}

// ─── Priorité (SET_PRIORITY) ──────────────────────────────────────────────────

export async function setPriorityIncidentService(
  incidentId: number,
  isPriority: boolean,
  actorUserId: number,
  actorRole: string
): Promise<ServiceResult<unknown>> {
  const current = await workshopRepository.getIncidentById(incidentId);
  if (!current) return notFound('Incident introuvable.');
  if (!canPerform(actorRole, 'SET_PRIORITY', current)) {
    return forbidden("Seul le responsable peut modifier la priorité d'un incident actif.");
  }

  const rid = await withTransaction(async (client) => {
    const id = await workshopRepository.updateIncidentData({
      incidentId, current,
      updates: { isPriority },
      role: actorRole, actorUserId,
      selection: { lineNumber: current.line_number, machineBrand: current.machine_brand },
      lineId: current.line_id, machineId: current.machine_id,
      robotLabel: current.robot_label, headNumber: current.head_number,
    }, client);
    if (!id) return null;
    await logIncidentEvent(incidentId, actorUserId, 'PRIORITY_CHANGED', {
      from: current.is_priority,
      to: isPriority,
    }, client);
    await autoFollowForResponsable(incidentId, actorUserId, actorRole, client);
    return id;
  });

  if (!rid) return notFound('Incident introuvable.');
  return { ok: true, data: await fetchIncidentForActor(rid, actorUserId) };
}

// ─── Commentaire responsable (RESPONSIBLE_COMMENT) ───────────────────────────

export async function setResponsibleCommentService(
  incidentId: number,
  responsibleComment: string,
  actorUserId: number,
  actorRole: string
): Promise<ServiceResult<unknown>> {
  const current = await workshopRepository.getIncidentById(incidentId);
  if (!current) return notFound('Incident introuvable.');
  if (!canPerform(actorRole, 'RESPONSIBLE_COMMENT', current)) {
    return forbidden('Seul le responsable peut gérer la consigne.');
  }

  const rid = await withTransaction(async (client) => {
    const id = await workshopRepository.updateIncidentData({
      incidentId, current,
      updates: { responsibleComment },
      role: actorRole, actorUserId,
      selection: { lineNumber: current.line_number, machineBrand: current.machine_brand },
      lineId: current.line_id, machineId: current.machine_id,
      robotLabel: current.robot_label, headNumber: current.head_number,
    }, client);
    if (!id) return null;
    await logIncidentEvent(incidentId, actorUserId, 'RESPONSIBLE_COMMENT_UPDATED', {
      from: current.responsible_comment,
      to: responsibleComment,
    }, client);
    await autoFollowForResponsable(incidentId, actorUserId, actorRole, client);
    return id;
  });

  if (!rid) return notFound('Incident introuvable.');
  return { ok: true, data: await fetchIncidentForActor(rid, actorUserId) };
}

// ─── Réordonnancement (REORDER) ───────────────────────────────────────────────

export async function setDisplayOrderIncidentService(
  incidentId: number,
  displayOrder: number,
  actorUserId: number,
  actorRole: string
): Promise<ServiceResult<unknown>> {
  const current = await workshopRepository.getIncidentById(incidentId);
  if (!current) return notFound('Incident introuvable.');
  if (!canPerform(actorRole, 'REORDER', current)) {
    return forbidden('Seul le responsable peut réordonner un incident actif.');
  }

  const rid = await withTransaction(async (client) => {
    const id = await workshopRepository.updateIncidentData({
      incidentId, current,
      updates: { displayOrder },
      role: actorRole, actorUserId,
      selection: { lineNumber: current.line_number, machineBrand: current.machine_brand },
      lineId: current.line_id, machineId: current.machine_id,
      robotLabel: current.robot_label, headNumber: current.head_number,
    }, client);
    if (!id) return null;
    await logIncidentEvent(incidentId, actorUserId, 'ORDER_CHANGED', {
      from: current.display_order,
      to: displayOrder,
    }, client);
    return id;
  });

  if (!rid) return notFound('Incident introuvable.');
  return { ok: true, data: await fetchIncidentForActor(rid, actorUserId) };
}

// ─── Demande d'édition (REQUEST_EDIT) ────────────────────────────────────────

export async function requestEditIncidentService(
  incidentId: number,
  editPayload: Record<string, unknown>,
  actorUserId: number,
  actorRole: string
): Promise<ServiceResult<unknown>> {
  const current = await workshopRepository.getIncidentById(incidentId);
  if (!current) return notFound('Incident introuvable.');
  if (!canPerform(actorRole, 'REQUEST_EDIT', current)) {
    return forbidden('Demande de correction non autorisée pour ce statut.');
  }
  if (Object.keys(editPayload).length === 0) {
    return badRequest('Aucune modification demandée.');
  }

  const rid = await withTransaction(async (client) => {
    const id = await workshopRepository.requestEditIncident(incidentId, editPayload, client);
    if (!id) return null;
    await logIncidentEvent(incidentId, actorUserId, 'EDIT_REQUESTED', {
      changes: editPayload,
      fields: requestedChangeKeys(editPayload),
    }, client);
    return id;
  });

  if (!rid) return notFound('Incident introuvable.');
  return { ok: true, data: await fetchIncidentForActor(rid, actorUserId) };
}

// ─── Approbation édition (APPROVE_EDIT) ──────────────────────────────────────

export async function approveEditIncidentService(
  incidentId: number,
  actorUserId: number,
  actorRole: string
): Promise<ServiceResult<unknown>> {
  const current = await workshopRepository.getIncidentById(incidentId);
  if (!current) return notFound('Incident introuvable.');
  if (!canPerform(actorRole, 'APPROVE_EDIT', current)) {
    return forbidden('Seul le responsable peut appliquer une correction.');
  }
  if (!current.edit_request) {
    return badRequest('Aucune demande de modification à appliquer.');
  }

  const requested = current.edit_request as Record<string, unknown>;
  const selection = await validateIncidentSelectionService({
    lineId: (requested.lineId as number | undefined) ?? current.line_id,
    machineId: (requested.machineId as string | undefined) ?? current.machine_id,
    robotLabel: (requested.robotLabel as string | undefined) ?? current.robot_label,
    headNumber: (requested.headNumber as number | undefined) ?? current.head_number,
  });
  if (!selection) return badRequest('Sélection ligne/machine/robot/tête invalide.');

  const rid = await withTransaction(async (client) => {
    const id = await workshopRepository.applyEditRequestIncident({ incidentId, current, requested, selection }, client);
    if (!id) return null;
    await logIncidentEvent(incidentId, actorUserId, 'EDIT_APPLIED', {
      changes: requested,
      fields: requestedChangeKeys(requested),
    }, client);
    await autoFollowForResponsable(incidentId, actorUserId, actorRole, client);
    return id;
  });

  if (!rid) return notFound('Incident introuvable.');
  return { ok: true, data: await fetchIncidentForActor(rid, actorUserId) };
}

// ─── Refus édition (REJECT_EDIT) ─────────────────────────────────────────────

export async function rejectEditIncidentService(
  incidentId: number,
  actorUserId: number,
  actorRole: string
): Promise<ServiceResult<unknown>> {
  const current = await workshopRepository.getIncidentById(incidentId);
  if (!current) return notFound('Incident introuvable.');
  if (!canPerform(actorRole, 'REJECT_EDIT', current)) {
    return forbidden('Seul le responsable peut refuser une correction.');
  }
  if (!current.edit_request) {
    return badRequest('Aucune demande de modification à refuser.');
  }

  const rid = await withTransaction(async (client) => {
    const id = await workshopRepository.rejectEditIncident(incidentId, client);
    if (!id) return null;
    await logIncidentEvent(incidentId, actorUserId, 'EDIT_REJECTED', {
      rejectedFields: requestedChangeKeys(current.edit_request as Record<string, unknown> | null),
    }, client);
    return id;
  });

  if (!rid) return notFound('Incident introuvable.');
  return { ok: true, data: await fetchIncidentForActor(rid, actorUserId) };
}

// ─── Demande d'annulation (REQUEST_CANCEL) ────────────────────────────────────

export async function requestCancelIncidentService(
  incidentId: number,
  reason: string,
  actorUserId: number,
  actorRole: string
): Promise<ServiceResult<unknown>> {
  const current = await workshopRepository.getIncidentById(incidentId);
  if (!current) return notFound('Incident introuvable.');
  if (!canPerform(actorRole, 'REQUEST_CANCEL', current)) {
    return forbidden("Demande d'annulation non autorisée pour ce rôle ou ce statut.");
  }
  if (!reason.trim()) {
    return badRequest("Motif obligatoire pour l'annulation.");
  }

  const rid = await withTransaction(async (client) => {
    const id = await workshopRepository.requestCancelIncident(incidentId, reason.trim(), client);
    if (!id) return null;
    await logIncidentEvent(incidentId, actorUserId, 'CANCEL_REQUESTED', {
      reason: reason.trim(),
      status: current.status,
    }, client);
    return id;
  });

  if (!rid) return notFound('Incident introuvable.');
  return { ok: true, data: await fetchIncidentForActor(rid, actorUserId) };
}

// ─── Refus annulation (REJECT_CANCEL) ────────────────────────────────────────

export async function rejectCancelIncidentService(
  incidentId: number,
  actorUserId: number,
  actorRole: string
): Promise<ServiceResult<unknown>> {
  const current = await workshopRepository.getIncidentById(incidentId);
  if (!current) return notFound('Incident introuvable.');
  if (!canPerform(actorRole, 'REJECT_CANCEL', current)) {
    return forbidden("Seul le responsable peut refuser une annulation.");
  }
  if (!current.cancel_request) {
    return badRequest("Aucune demande d'annulation à refuser.");
  }

  const rid = await withTransaction(async (client) => {
    const id = await workshopRepository.rejectCancelIncident(incidentId, client);
    if (!id) return null;
    await logIncidentEvent(incidentId, actorUserId, 'CANCEL_REQUEST_REJECTED', {
      requestedReason: current.cancel_request_reason,
    }, client);
    return id;
  });

  if (!rid) return notFound('Incident introuvable.');
  return { ok: true, data: await fetchIncidentForActor(rid, actorUserId) };
}

// ─── Annulation directe (CANCEL / APPROVE_CANCEL) ────────────────────────────

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
    if (!canPerform(actorRole, action, incident)) return { kind: 'forbidden' as const };

    const ok = await workshopRepository.cancelIncidentData(incidentId, client);
    if (!ok) return { kind: 'not_found' as const };

    await logIncidentEvent(incidentId, actorUserId, 'INCIDENT_CANCELED', {
      mode: action === 'APPROVE_CANCEL' ? 'request_approved' : 'direct',
      requestedReason: incident.cancel_request_reason ?? incident.delete_request_reason,
      previousStatus: incident.status,
    }, client);
    return { kind: 'ok' as const };
  });

  if (result.kind === 'not_found') return notFound('Incident introuvable.');
  if (result.kind === 'forbidden') {
    return forbidden('Annulation non autorisée pour ce rôle ou ce statut.');
  }
  return { ok: true, data: { message: 'Incident annulé.' } };
}

// ─── Suivi (FOLLOW / UNFOLLOW) ────────────────────────────────────────────────

export async function followIncidentService(
  incidentId: number,
  actorUserId: number,
  actorRole: string
): Promise<ServiceResult<unknown>> {
  if (actorRole !== 'RESPONSABLE') return forbidden('Seul le responsable peut suivre un incident.');
  if (!(await workshopRepository.incidentExists(incidentId))) return notFound('Incident introuvable.');

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
  if (actorRole !== 'RESPONSABLE') return forbidden('Seul le responsable peut retirer un suivi.');
  if (!(await workshopRepository.incidentExists(incidentId))) return notFound('Incident introuvable.');

  await withTransaction(async (client) => {
    await workshopRepository.unfollowIncidentData(incidentId, actorUserId, client);
    await logIncidentEvent(incidentId, actorUserId, 'INCIDENT_UNFOLLOWED', {}, client);
  });

  return { ok: true, data: await fetchIncidentForActor(incidentId, actorUserId) };
}

// ─── Réordonnancement en masse (REORDER) ─────────────────────────────────────

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
    await Promise.all(uniqueIds.map((id, index) =>
      logIncidentEvent(id, actorUserId, 'INCIDENT_REORDERED', {
        position: index + 1,
        batchSize: uniqueIds.length,
      }, client)
    ));
    return count;
  });

  return { ok: true, data: { updated } };
}

// ─── Routeur de mise à jour (compatibilité tests + API PATCH) ─────────────────
// Délègue à la fonction de service dédiée selon le contenu des updates.

export async function updateIncidentService(
  id: number,
  updates: UpdateIncidentInput,
  actorUserId: number,
  actorRole: string
): Promise<ServiceResult<unknown>> {
  if (updates.isTaken === true) {
    return takeIncidentService(id, actorUserId, actorRole);
  }
  if (updates.status === 'PENDING') {
    return setPendingIncidentService(id, updates.diagnostic, actorUserId, actorRole);
  }
  if (updates.status === 'OPEN' && updates.diagnostic === undefined) {
    return resumeIncidentService(id, actorUserId, actorRole);
  }
  if (updates.status === 'CLOSED') {
    return closeIncidentService(id, updates.interventionNote, actorUserId, actorRole);
  }
  if (updates.status === 'INVALIDATED' || (updates.status === 'CANCELED' && updates.invalidationReason !== undefined)) {
    return invalidateIncidentService(id, updates.invalidationReason, actorUserId, actorRole);
  }
  if (updates.isPriority !== undefined) {
    return setPriorityIncidentService(id, updates.isPriority, actorUserId, actorRole);
  }
  if (updates.responsibleComment !== undefined) {
    return setResponsibleCommentService(id, updates.responsibleComment, actorUserId, actorRole);
  }
  if (updates.displayOrder !== undefined) {
    return setDisplayOrderIncidentService(id, updates.displayOrder, actorUserId, actorRole);
  }
  if (updates.requestOnly === true) {
    const { requestOnly, cancelRequest, cancelRequestReason, deleteRequest, deleteRequestReason, ...editPayload } = updates;
    return requestEditIncidentService(id, editPayload as Record<string, unknown>, actorUserId, actorRole);
  }
  if (updates.cancelRequest === true || updates.deleteRequest === true) {
    const reason = updates.cancelRequestReason ?? updates.deleteRequestReason ?? '';
    return requestCancelIncidentService(id, reason, actorUserId, actorRole);
  }
  if (updates.applyEditRequest === true) {
    return approveEditIncidentService(id, actorUserId, actorRole);
  }
  if (updates.rejectEditRequest === true) {
    return rejectEditIncidentService(id, actorUserId, actorRole);
  }
  if (updates.rejectDeleteRequest === true) {
    return rejectCancelIncidentService(id, actorUserId, actorRole);
  }
  const { requestOnly, cancelRequest, cancelRequestReason, deleteRequest, deleteRequestReason, applyEditRequest, rejectEditRequest, rejectDeleteRequest, isTaken, isPriority, displayOrder, status, responsibleComment, ...editFields } = updates;
  return editIncidentService(id, editFields, actorUserId, actorRole);
}
