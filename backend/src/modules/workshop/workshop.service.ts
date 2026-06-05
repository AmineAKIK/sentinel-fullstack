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

const EDIT_FIELD_KEYS = [
  'shift',
  'lineId',
  'machineId',
  'robotLabel',
  'headNumber',
  'state',
  'comment',
  'currentProduct',
] as const satisfies readonly (keyof UpdateIncidentInput)[];

const EDIT_FIELD_SET = new Set<string>(EDIT_FIELD_KEYS);

function definedUpdateKeys(updates: UpdateIncidentInput): string[] {
  return Object.keys(updates).filter((key) => updates[key as keyof UpdateIncidentInput] !== undefined);
}

function hasOnlyKeys(keys: string[], allowed: readonly string[]): boolean {
  const allowedSet = new Set(allowed);
  return keys.every((key) => allowedSet.has(key));
}

function unexpectedFieldsError(): ServiceResult<never> {
  return badRequest('Payload de modification ambigu ou incompatible avec l’action demandée.');
}

function pickEditPayload(updates: UpdateIncidentInput): Pick<UpdateIncidentInput, (typeof EDIT_FIELD_KEYS)[number]> {
  const payload: Partial<Pick<UpdateIncidentInput, (typeof EDIT_FIELD_KEYS)[number]>> = {};
  for (const key of EDIT_FIELD_KEYS) {
    const value = updates[key];
    if (value !== undefined) {
      payload[key] = value as never;
    }
  }
  return payload as Pick<UpdateIncidentInput, (typeof EDIT_FIELD_KEYS)[number]>;
}

function hasEditFields(keys: string[]): boolean {
  return keys.some((key) => EDIT_FIELD_SET.has(key));
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
  actorUserId: number,
  actorRole: string
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
    await autoFollowForResponsable(id, actorUserId, actorRole, client);
    return id;
  });

  return { ok: true, data: await workshopRepository.fetchIncidentWithUsersForActor(incidentId, actorUserId) };
}

// ─── Prise en charge (TAKE) ───────────────────────────────────────────────────

export async function takeIncidentService(
  incidentId: number,
  actorUserId: number,
  actorRole: string
): Promise<ServiceResult<unknown>> {
  const result = await withTransaction(async (client) => {
    const current = await workshopRepository.getIncidentById(incidentId, client);
    if (!current) return { kind: 'not_found' as const };
    if (!canPerform(actorRole, 'TAKE', current)) return { kind: 'forbidden' as const };

    const id = await workshopRepository.updateIncidentData({
      incidentId, current,
      updates: { isTaken: true },
      role: actorRole, actorUserId,
      selection: { lineNumber: current.line_number, machineBrand: current.machine_brand },
      lineId: current.line_id, machineId: current.machine_id,
      robotLabel: current.robot_label, headNumber: current.head_number,
    }, client);
    if (!id) return { kind: 'not_found' as const };
    await logIncidentEvent(incidentId, actorUserId, 'INCIDENT_TAKEN', {
      previousTakenByUserId: current.taken_by_user_id,
    }, client);
    return { kind: 'ok' as const, id };
  });

  if (result.kind === 'not_found') return notFound('Incident introuvable.');
  if (result.kind === 'forbidden') return forbidden('Prise en charge non autorisée pour ce rôle ou ce statut.');
  return { ok: true, data: await workshopRepository.fetchIncidentWithUsersForActor(result.id, actorUserId) };
}

// ─── Mise en attente (SET_PENDING) ────────────────────────────────────────────

export async function setPendingIncidentService(
  incidentId: number,
  diagnostic: string | undefined,
  actorUserId: number,
  actorRole: string
): Promise<ServiceResult<unknown>> {
  const result = await withTransaction(async (client) => {
    const current = await workshopRepository.getIncidentById(incidentId, client);
    if (!current) return { kind: 'not_found' as const };
    if (!canPerform(actorRole, 'SET_PENDING', current)) return { kind: 'forbidden' as const };
    if (!diagnostic?.trim() && !current.diagnostic) return { kind: 'bad_request' as const, msg: 'Diagnostic obligatoire avant mise en attente.' };

    const id = await workshopRepository.updateIncidentData({
      incidentId, current,
      updates: { status: 'PENDING', diagnostic },
      role: actorRole, actorUserId,
      selection: { lineNumber: current.line_number, machineBrand: current.machine_brand },
      lineId: current.line_id, machineId: current.machine_id,
      robotLabel: current.robot_label, headNumber: current.head_number,
    }, client);
    if (!id) return { kind: 'not_found' as const };
    await logIncidentEvent(incidentId, actorUserId, 'INCIDENT_SET_PENDING', {
      from: current.status,
      to: 'PENDING',
      diagnostic: diagnostic ?? current.diagnostic,
    }, client);
    return { kind: 'ok' as const, id };
  });

  if (result.kind === 'not_found') return notFound('Incident introuvable.');
  if (result.kind === 'forbidden') return forbidden('Mise en attente non autorisée pour ce rôle ou ce statut.');
  if (result.kind === 'bad_request') return badRequest(result.msg);
  return { ok: true, data: await workshopRepository.fetchIncidentWithUsersForActor(result.id, actorUserId) };
}

// ─── Reprise (RESUME) ─────────────────────────────────────────────────────────

export async function resumeIncidentService(
  incidentId: number,
  actorUserId: number,
  actorRole: string
): Promise<ServiceResult<unknown>> {
  const result = await withTransaction(async (client) => {
    const current = await workshopRepository.getIncidentById(incidentId, client);
    if (!current) return { kind: 'not_found' as const };
    if (!canPerform(actorRole, 'RESUME', current)) return { kind: 'forbidden' as const };

    const id = await workshopRepository.updateIncidentData({
      incidentId, current,
      updates: { status: 'OPEN' },
      role: actorRole, actorUserId,
      selection: { lineNumber: current.line_number, machineBrand: current.machine_brand },
      lineId: current.line_id, machineId: current.machine_id,
      robotLabel: current.robot_label, headNumber: current.head_number,
    }, client);
    if (!id) return { kind: 'not_found' as const };
    await logIncidentEvent(incidentId, actorUserId, 'INCIDENT_RESUMED', {
      from: 'PENDING',
      to: 'OPEN',
    }, client);
    return { kind: 'ok' as const, id };
  });

  if (result.kind === 'not_found') return notFound('Incident introuvable.');
  if (result.kind === 'forbidden') return forbidden('Reprise non autorisée pour ce rôle ou ce statut.');
  return { ok: true, data: await workshopRepository.fetchIncidentWithUsersForActor(result.id, actorUserId) };
}

// ─── Clôture (CLOSE) ─────────────────────────────────────────────────────────

export async function closeIncidentService(
  incidentId: number,
  interventionNote: string | undefined,
  actorUserId: number,
  actorRole: string
): Promise<ServiceResult<unknown>> {
  const result = await withTransaction(async (client) => {
    const current = await workshopRepository.getIncidentById(incidentId, client);
    if (!current) return { kind: 'not_found' as const };
    if (!canPerform(actorRole, 'CLOSE', current)) return { kind: 'forbidden' as const };
    if (current.status === 'PENDING') return { kind: 'bad_request' as const, msg: 'Impossible de clôturer un incident en attente.' };
    if (!interventionNote?.trim() && !current.intervention_note) return { kind: 'bad_request' as const, msg: 'Documentation intervention obligatoire avant clôture.' };

    const id = await workshopRepository.updateIncidentData({
      incidentId, current,
      updates: { status: 'CLOSED', interventionNote },
      role: actorRole, actorUserId,
      selection: { lineNumber: current.line_number, machineBrand: current.machine_brand },
      lineId: current.line_id, machineId: current.machine_id,
      robotLabel: current.robot_label, headNumber: current.head_number,
    }, client);
    if (!id) return { kind: 'not_found' as const };
    // Clear any pending edit request — incident is now closed.
    if (current.edit_request != null) {
      await workshopRepository.rejectEditIncident(incidentId, client);
    }
    await logIncidentEvent(incidentId, actorUserId, 'INCIDENT_CLOSED', {
      from: current.status,
      to: 'CLOSED',
      interventionNote: interventionNote ?? current.intervention_note,
    }, client);
    return { kind: 'ok' as const, id };
  });

  if (result.kind === 'not_found') return notFound('Incident introuvable.');
  if (result.kind === 'forbidden') return forbidden('Clôture non autorisée pour ce rôle ou ce statut.');
  if (result.kind === 'bad_request') return badRequest(result.msg);
  return { ok: true, data: await workshopRepository.fetchIncidentWithUsersForActor(result.id, actorUserId) };
}

// ─── Invalidation (INVALIDATE_CLOSED) ────────────────────────────────────────

export async function invalidateIncidentService(
  incidentId: number,
  invalidationReason: string | undefined,
  actorUserId: number,
  actorRole: string
): Promise<ServiceResult<unknown>> {
  if (!invalidationReason?.trim()) return badRequest("Motif obligatoire pour l'invalidation.");

  const result = await withTransaction(async (client) => {
    const current = await workshopRepository.getIncidentById(incidentId, client);
    if (!current) return { kind: 'not_found' as const };
    if (!canPerform(actorRole, 'INVALIDATE_CLOSED', current)) return { kind: 'forbidden' as const };

    const id = await workshopRepository.invalidateIncident(incidentId, client);
    if (!id) return { kind: 'not_found' as const };
    await logIncidentEvent(incidentId, actorUserId, 'INCIDENT_INVALIDATED', {
      reason: invalidationReason.trim(),
      previousStatus: current.status,
    }, client);
    await autoFollowForResponsable(incidentId, actorUserId, actorRole, client);
    return { kind: 'ok' as const, id };
  });

  if (result.kind === 'not_found') return notFound('Incident introuvable.');
  if (result.kind === 'forbidden') return forbidden('Seul le responsable peut invalider un cas clôturé.');
  return { ok: true, data: await workshopRepository.fetchIncidentWithUsersForActor(result.id, actorUserId) };
}

// ─── Modification directe (DIRECT_EDIT / EDIT_AFTER_TAKE) ────────────────────

export async function editIncidentService(
  incidentId: number,
  updates: Pick<UpdateIncidentInput, 'shift' | 'lineId' | 'machineId' | 'robotLabel' | 'headNumber' | 'state' | 'comment' | 'currentProduct'>,
  actorUserId: number,
  actorRole: string
): Promise<ServiceResult<unknown>> {
  const result = await withTransaction(async (client) => {
    const current = await workshopRepository.getIncidentById(incidentId, client);
    if (!current) return { kind: 'not_found' as const };

    if (
      !canPerform(actorRole, 'DIRECT_EDIT', current) &&
      !canPerform(actorRole, 'EDIT_AFTER_TAKE', current, actorUserId)
    ) {
      return { kind: 'forbidden' as const };
    }

    const lineId = updates.lineId ?? current.line_id;
    const machineId = updates.machineId ?? current.machine_id;
    const robotLabel = updates.robotLabel ?? current.robot_label;
    const headNumber = updates.headNumber ?? current.head_number;

    const selection = await validateIncidentSelectionService({ lineId, machineId, robotLabel, headNumber });
    if (!selection) return { kind: 'bad_request' as const, msg: 'Sélection ligne/machine/robot/tête invalide.' };

    const directChanges: Record<string, { old: unknown; new: unknown }> = {};
    if (updates.shift !== undefined && updates.shift !== current.shift) directChanges.shift = { old: current.shift, new: updates.shift };
    if (updates.lineId !== undefined && updates.lineId !== current.line_id) { directChanges.lineId = { old: current.line_id, new: lineId }; directChanges.lineNumber = { old: current.line_number, new: selection.lineNumber }; }
    if (updates.machineId !== undefined && updates.machineId !== current.machine_id) { directChanges.machineId = { old: current.machine_id, new: machineId }; directChanges.machineBrand = { old: current.machine_brand, new: selection.machineBrand }; }
    if (updates.robotLabel !== undefined && updates.robotLabel !== current.robot_label) directChanges.robotLabel = { old: current.robot_label, new: robotLabel };
    if (updates.headNumber !== undefined && updates.headNumber !== current.head_number) directChanges.headNumber = { old: current.head_number, new: headNumber };
    if (updates.state !== undefined && updates.state !== current.state) directChanges.state = { old: current.state, new: updates.state };
    if (updates.comment !== undefined && updates.comment !== current.comment) directChanges.comment = { old: current.comment, new: updates.comment };
    if (updates.currentProduct !== undefined && updates.currentProduct !== current.current_product) directChanges.currentProduct = { old: current.current_product, new: updates.currentProduct };

    const id = await workshopRepository.updateIncidentData({
      incidentId, current, updates, role: actorRole, actorUserId, selection, lineId, machineId, robotLabel, headNumber,
    }, client);
    if (!id) return { kind: 'not_found' as const };

    // A direct edit supersedes any pending edit request from the OPERATOR.
    if (current.edit_request != null) {
      await workshopRepository.rejectEditIncident(incidentId, client);
    }

    await logIncidentEvent(incidentId, actorUserId, 'INCIDENT_UPDATED', {
      changes: directChanges,
      fields: Object.keys(directChanges),
      editRequestCleared: current.edit_request != null,
    }, client);
    await autoFollowForResponsable(incidentId, actorUserId, actorRole, client);
    return { kind: 'ok' as const, id };
  });

  if (result.kind === 'not_found') return notFound('Incident introuvable.');
  if (result.kind === 'forbidden') return forbidden('Modification directe non autorisée pour ce rôle ou ce statut.');
  if (result.kind === 'bad_request') return badRequest(result.msg);
  return { ok: true, data: await workshopRepository.fetchIncidentWithUsersForActor(result.id, actorUserId) };
}

// ─── Priorité (SET_PRIORITY) ──────────────────────────────────────────────────

export async function setPriorityIncidentService(
  incidentId: number,
  isPriority: boolean,
  actorUserId: number,
  actorRole: string
): Promise<ServiceResult<unknown>> {
  const result = await withTransaction(async (client) => {
    const current = await workshopRepository.getIncidentById(incidentId, client);
    if (!current) return { kind: 'not_found' as const };
    if (!canPerform(actorRole, 'SET_PRIORITY', current)) return { kind: 'forbidden' as const };

    const id = await workshopRepository.updateIncidentData({
      incidentId, current,
      updates: { isPriority },
      role: actorRole, actorUserId,
      selection: { lineNumber: current.line_number, machineBrand: current.machine_brand },
      lineId: current.line_id, machineId: current.machine_id,
      robotLabel: current.robot_label, headNumber: current.head_number,
    }, client);
    if (!id) return { kind: 'not_found' as const };
    await logIncidentEvent(incidentId, actorUserId, 'PRIORITY_CHANGED', {
      from: current.is_priority,
      to: isPriority,
    }, client);
    await autoFollowForResponsable(incidentId, actorUserId, actorRole, client);
    return { kind: 'ok' as const, id };
  });

  if (result.kind === 'not_found') return notFound('Incident introuvable.');
  if (result.kind === 'forbidden') return forbidden("Seul le responsable peut modifier la priorité d'un incident actif.");
  return { ok: true, data: await workshopRepository.fetchIncidentWithUsersForActor(result.id, actorUserId) };
}

// ─── Commentaire responsable (RESPONSIBLE_COMMENT) ───────────────────────────

export async function setResponsibleCommentService(
  incidentId: number,
  responsibleComment: string,
  actorUserId: number,
  actorRole: string
): Promise<ServiceResult<unknown>> {
  const result = await withTransaction(async (client) => {
    const current = await workshopRepository.getIncidentById(incidentId, client);
    if (!current) return { kind: 'not_found' as const };
    if (!canPerform(actorRole, 'RESPONSIBLE_COMMENT', current)) return { kind: 'forbidden' as const };

    const id = await workshopRepository.updateIncidentData({
      incidentId, current,
      updates: { responsibleComment },
      role: actorRole, actorUserId,
      selection: { lineNumber: current.line_number, machineBrand: current.machine_brand },
      lineId: current.line_id, machineId: current.machine_id,
      robotLabel: current.robot_label, headNumber: current.head_number,
    }, client);
    if (!id) return { kind: 'not_found' as const };
    await logIncidentEvent(incidentId, actorUserId, 'RESPONSIBLE_COMMENT_UPDATED', {
      from: current.responsible_comment,
      to: responsibleComment,
    }, client);
    await autoFollowForResponsable(incidentId, actorUserId, actorRole, client);
    return { kind: 'ok' as const, id };
  });

  if (result.kind === 'not_found') return notFound('Incident introuvable.');
  if (result.kind === 'forbidden') return forbidden('Seul le responsable peut gérer la consigne.');
  return { ok: true, data: await workshopRepository.fetchIncidentWithUsersForActor(result.id, actorUserId) };
}

// ─── Réordonnancement (REORDER) ───────────────────────────────────────────────

export async function setDisplayOrderIncidentService(
  incidentId: number,
  displayOrder: number,
  actorUserId: number,
  actorRole: string
): Promise<ServiceResult<unknown>> {
  const result = await withTransaction(async (client) => {
    const current = await workshopRepository.getIncidentById(incidentId, client);
    if (!current) return { kind: 'not_found' as const };
    if (!canPerform(actorRole, 'REORDER', current)) return { kind: 'forbidden' as const };

    const id = await workshopRepository.updateIncidentData({
      incidentId, current,
      updates: { displayOrder },
      role: actorRole, actorUserId,
      selection: { lineNumber: current.line_number, machineBrand: current.machine_brand },
      lineId: current.line_id, machineId: current.machine_id,
      robotLabel: current.robot_label, headNumber: current.head_number,
    }, client);
    if (!id) return { kind: 'not_found' as const };
    await logIncidentEvent(incidentId, actorUserId, 'ORDER_CHANGED', {
      from: current.display_order,
      to: displayOrder,
    }, client);
    return { kind: 'ok' as const, id };
  });

  if (result.kind === 'not_found') return notFound('Incident introuvable.');
  if (result.kind === 'forbidden') return forbidden('Seul le responsable peut réordonner un incident actif.');
  return { ok: true, data: await workshopRepository.fetchIncidentWithUsersForActor(result.id, actorUserId) };
}

// ─── Demande d'édition (REQUEST_EDIT) ────────────────────────────────────────

export async function requestEditIncidentService(
  incidentId: number,
  editPayload: Record<string, unknown>,
  actorUserId: number,
  actorRole: string
): Promise<ServiceResult<unknown>> {
  const result = await withTransaction(async (client) => {
    const current = await workshopRepository.getIncidentById(incidentId, client);
    if (!current) return { kind: 'not_found' as const };
    if (!canPerform(actorRole, 'REQUEST_EDIT', current, actorUserId)) return { kind: 'forbidden' as const };
    if (Object.keys(editPayload).length === 0) return { kind: 'bad_request' as const, msg: 'Aucune modification demandée.' };

    const id = await workshopRepository.requestEditIncident(incidentId, editPayload, client);
    if (!id) return { kind: 'not_found' as const };
    await logIncidentEvent(incidentId, actorUserId, 'EDIT_REQUESTED', {
      changes: editPayload,
      fields: requestedChangeKeys(editPayload),
    }, client);
    return { kind: 'ok' as const, id };
  });

  if (result.kind === 'not_found') return notFound('Incident introuvable.');
  if (result.kind === 'forbidden') return forbidden('Demande de correction non autorisée pour ce statut.');
  if (result.kind === 'bad_request') return badRequest(result.msg);
  return { ok: true, data: await workshopRepository.fetchIncidentWithUsersForActor(result.id, actorUserId) };
}

// ─── Approbation édition (APPROVE_EDIT) ──────────────────────────────────────

export async function approveEditIncidentService(
  incidentId: number,
  actorUserId: number,
  actorRole: string
): Promise<ServiceResult<unknown>> {
  const result = await withTransaction(async (client) => {
    const current = await workshopRepository.getIncidentById(incidentId, client);
    if (!current) return { kind: 'not_found' as const };
    if (!canPerform(actorRole, 'APPROVE_EDIT', current)) return { kind: 'forbidden' as const };
    if (!current.edit_request) return { kind: 'bad_request' as const, msg: 'Aucune demande de modification à appliquer.' };

    const requested = current.edit_request as Record<string, unknown>;
    const selection = await validateIncidentSelectionService({
      lineId: (requested.lineId as number | undefined) ?? current.line_id,
      machineId: (requested.machineId as string | undefined) ?? current.machine_id,
      robotLabel: (requested.robotLabel as string | undefined) ?? current.robot_label,
      headNumber: (requested.headNumber as number | undefined) ?? current.head_number,
    });
    if (!selection) return { kind: 'bad_request' as const, msg: 'Sélection ligne/machine/robot/tête invalide.' };

    const id = await workshopRepository.applyEditRequestIncident({ incidentId, current, requested, selection }, client);
    if (!id) return { kind: 'not_found' as const };
    await logIncidentEvent(incidentId, actorUserId, 'EDIT_APPLIED', {
      changes: requested,
      fields: requestedChangeKeys(requested),
    }, client);
    await autoFollowForResponsable(incidentId, actorUserId, actorRole, client);
    return { kind: 'ok' as const, id };
  });

  if (result.kind === 'not_found') return notFound('Incident introuvable.');
  if (result.kind === 'forbidden') return forbidden('Seul le responsable peut appliquer une correction.');
  if (result.kind === 'bad_request') return badRequest(result.msg);
  return { ok: true, data: await workshopRepository.fetchIncidentWithUsersForActor(result.id, actorUserId) };
}

// ─── Refus édition (REJECT_EDIT) ─────────────────────────────────────────────

export async function rejectEditIncidentService(
  incidentId: number,
  actorUserId: number,
  actorRole: string
): Promise<ServiceResult<unknown>> {
  const result = await withTransaction(async (client) => {
    const current = await workshopRepository.getIncidentById(incidentId, client);
    if (!current) return { kind: 'not_found' as const };
    if (!canPerform(actorRole, 'REJECT_EDIT', current)) return { kind: 'forbidden' as const };
    if (!current.edit_request) return { kind: 'bad_request' as const, msg: 'Aucune demande de modification à refuser.' };

    const id = await workshopRepository.rejectEditIncident(incidentId, client);
    if (!id) return { kind: 'not_found' as const };
    await logIncidentEvent(incidentId, actorUserId, 'EDIT_REJECTED', {
      rejectedFields: requestedChangeKeys(current.edit_request as Record<string, unknown> | null),
    }, client);
    await autoFollowForResponsable(incidentId, actorUserId, actorRole, client);
    return { kind: 'ok' as const, id };
  });

  if (result.kind === 'not_found') return notFound('Incident introuvable.');
  if (result.kind === 'forbidden') return forbidden('Seul le responsable peut refuser une correction.');
  if (result.kind === 'bad_request') return badRequest(result.msg);
  return { ok: true, data: await workshopRepository.fetchIncidentWithUsersForActor(result.id, actorUserId) };
}

// ─── Demande d'annulation (REQUEST_CANCEL) ────────────────────────────────────

export async function requestCancelIncidentService(
  incidentId: number,
  reason: string,
  actorUserId: number,
  actorRole: string
): Promise<ServiceResult<unknown>> {
  if (!reason.trim()) return badRequest("Motif obligatoire pour l'annulation.");

  const result = await withTransaction(async (client) => {
    const current = await workshopRepository.getIncidentById(incidentId, client);
    if (!current) return { kind: 'not_found' as const };
    if (!canPerform(actorRole, 'REQUEST_CANCEL', current, actorUserId)) return { kind: 'forbidden' as const };

    const id = await workshopRepository.requestCancelIncident(incidentId, reason.trim(), client);
    if (!id) return { kind: 'not_found' as const };
    await logIncidentEvent(incidentId, actorUserId, 'CANCEL_REQUESTED', {
      reason: reason.trim(),
      status: current.status,
    }, client);
    return { kind: 'ok' as const, id };
  });

  if (result.kind === 'not_found') return notFound('Incident introuvable.');
  if (result.kind === 'forbidden') return forbidden("Demande d'annulation non autorisée pour ce rôle ou ce statut.");
  return { ok: true, data: await workshopRepository.fetchIncidentWithUsersForActor(result.id, actorUserId) };
}

// ─── Refus annulation (REJECT_CANCEL) ────────────────────────────────────────

export async function rejectCancelIncidentService(
  incidentId: number,
  actorUserId: number,
  actorRole: string
): Promise<ServiceResult<unknown>> {
  const result = await withTransaction(async (client) => {
    const current = await workshopRepository.getIncidentById(incidentId, client);
    if (!current) return { kind: 'not_found' as const };
    if (!canPerform(actorRole, 'REJECT_CANCEL', current)) return { kind: 'forbidden' as const };
    // Check both fields (delete_request is a legacy alias for cancel_request).
    if (!current.cancel_request && !current.delete_request) {
      return { kind: 'bad_request' as const, msg: "Aucune demande d'annulation à refuser." };
    }

    const id = await workshopRepository.rejectCancelIncident(incidentId, client);
    if (!id) return { kind: 'not_found' as const };
    await logIncidentEvent(incidentId, actorUserId, 'CANCEL_REQUEST_REJECTED', {
      requestedReason: current.cancel_request_reason,
    }, client);
    await autoFollowForResponsable(incidentId, actorUserId, actorRole, client);
    return { kind: 'ok' as const, id };
  });

  if (result.kind === 'not_found') return notFound('Incident introuvable.');
  if (result.kind === 'forbidden') return forbidden("Seul le responsable peut refuser une annulation.");
  if (result.kind === 'bad_request') return badRequest(result.msg);
  return { ok: true, data: await workshopRepository.fetchIncidentWithUsersForActor(result.id, actorUserId) };
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
    await autoFollowForResponsable(incidentId, actorUserId, actorRole, client);
    return { kind: 'ok' as const };
  });

  if (result.kind === 'not_found') return notFound('Incident introuvable.');
  if (result.kind === 'forbidden') return forbidden('Annulation non autorisée pour ce rôle ou ce statut.');
  return { ok: true, data: { message: 'Incident annulé.' } };
}

// ─── Suivi (FOLLOW / UNFOLLOW) ────────────────────────────────────────────────

export async function followIncidentService(
  incidentId: number,
  actorUserId: number,
  actorRole: string
): Promise<ServiceResult<unknown>> {
  if (actorRole !== 'RESPONSABLE') return forbidden('Seul le responsable peut suivre un incident.');

  const incident = await workshopRepository.getIncidentStatus(incidentId);
  if (!incident) return notFound('Incident introuvable.');
  if (incident.status === 'CLOSED' || incident.status === 'CANCELED' || incident.status === 'INVALIDATED') {
    return forbidden('Impossible de suivre un incident terminé.');
  }

  await withTransaction(async (client) => {
    await workshopRepository.followIncidentData(incidentId, actorUserId, client);
    await logIncidentEvent(incidentId, actorUserId, 'INCIDENT_FOLLOWED', {}, client);
  });

  return { ok: true, data: await workshopRepository.fetchIncidentWithUsersForActor(incidentId, actorUserId) };
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

  return { ok: true, data: await workshopRepository.fetchIncidentWithUsersForActor(incidentId, actorUserId) };
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

  const result = await withTransaction(async (client) => {
    const reorderableIds = await workshopRepository.listReorderableIncidentIds(uniqueIds, client);
    if (reorderableIds.length !== uniqueIds.length) {
      return { kind: 'bad_request' as const };
    }

    const count = await workshopRepository.reorderIncidentsData(uniqueIds, client);
    await Promise.all(uniqueIds.map((id, index) =>
      logIncidentEvent(id, actorUserId, 'INCIDENT_REORDERED', {
        position: index + 1,
        batchSize: uniqueIds.length,
      }, client)
    ));
    return { kind: 'ok' as const, count };
  });

  if (result.kind === 'bad_request') {
    return badRequest('Tous les incidents réordonnés doivent exister et être actifs.');
  }
  return { ok: true, data: { updated: result.count } };
}

// ─── Routeur de mise à jour (compatibilité tests + API PATCH) ─────────────────
// Délègue à la fonction de service dédiée selon le contenu des updates.

export async function updateIncidentService(
  id: number,
  updates: UpdateIncidentInput,
  actorUserId: number,
  actorRole: string
): Promise<ServiceResult<unknown>> {
  const keys = definedUpdateKeys(updates);
  if (keys.length === 0) return badRequest('Aucun champ à mettre à jour.');

  if (updates.isTaken === true) {
    if (!hasOnlyKeys(keys, ['isTaken'])) return unexpectedFieldsError();
    return takeIncidentService(id, actorUserId, actorRole);
  }
  if (updates.isTaken !== undefined) return unexpectedFieldsError();

  if (updates.status === 'PENDING') {
    if (!hasOnlyKeys(keys, ['status', 'diagnostic'])) return unexpectedFieldsError();
    return setPendingIncidentService(id, updates.diagnostic, actorUserId, actorRole);
  }
  if (updates.status === 'OPEN') {
    if (!hasOnlyKeys(keys, ['status'])) return unexpectedFieldsError();
    return resumeIncidentService(id, actorUserId, actorRole);
  }
  if (updates.status === 'CLOSED') {
    if (!hasOnlyKeys(keys, ['status', 'interventionNote'])) return unexpectedFieldsError();
    return closeIncidentService(id, updates.interventionNote, actorUserId, actorRole);
  }
  if (updates.status === 'INVALIDATED' || (updates.status === 'CANCELED' && updates.invalidationReason !== undefined)) {
    if (!hasOnlyKeys(keys, ['status', 'invalidationReason'])) return unexpectedFieldsError();
    return invalidateIncidentService(id, updates.invalidationReason, actorUserId, actorRole);
  }
  if (updates.status !== undefined) return unexpectedFieldsError();

  if (updates.isPriority !== undefined) {
    if (!hasOnlyKeys(keys, ['isPriority'])) return unexpectedFieldsError();
    return setPriorityIncidentService(id, updates.isPriority, actorUserId, actorRole);
  }
  if (updates.responsibleComment !== undefined) {
    if (!hasOnlyKeys(keys, ['responsibleComment'])) return unexpectedFieldsError();
    return setResponsibleCommentService(id, updates.responsibleComment, actorUserId, actorRole);
  }
  if (updates.displayOrder !== undefined) {
    if (!hasOnlyKeys(keys, ['displayOrder'])) return unexpectedFieldsError();
    return setDisplayOrderIncidentService(id, updates.displayOrder, actorUserId, actorRole);
  }
  if (updates.requestOnly === true) {
    if (!hasOnlyKeys(keys, ['requestOnly', ...EDIT_FIELD_KEYS])) return unexpectedFieldsError();
    if (!hasEditFields(keys)) return badRequest('Aucune modification demandée.');
    const editPayload = pickEditPayload(updates);
    return requestEditIncidentService(id, editPayload as Record<string, unknown>, actorUserId, actorRole);
  }
  if (updates.requestOnly !== undefined) return unexpectedFieldsError();

  if (updates.cancelRequest === true || updates.deleteRequest === true) {
    if (!hasOnlyKeys(keys, ['cancelRequest', 'cancelRequestReason', 'deleteRequest', 'deleteRequestReason'])) {
      return unexpectedFieldsError();
    }
    const reason = updates.cancelRequestReason ?? updates.deleteRequestReason ?? '';
    return requestCancelIncidentService(id, reason, actorUserId, actorRole);
  }
  if (
    updates.cancelRequest !== undefined ||
    updates.deleteRequest !== undefined ||
    updates.cancelRequestReason !== undefined ||
    updates.deleteRequestReason !== undefined
  ) {
    return unexpectedFieldsError();
  }

  if (updates.applyEditRequest === true) {
    if (!hasOnlyKeys(keys, ['applyEditRequest'])) return unexpectedFieldsError();
    return approveEditIncidentService(id, actorUserId, actorRole);
  }
  if (updates.applyEditRequest !== undefined) return unexpectedFieldsError();

  if (updates.rejectEditRequest === true) {
    if (!hasOnlyKeys(keys, ['rejectEditRequest'])) return unexpectedFieldsError();
    return rejectEditIncidentService(id, actorUserId, actorRole);
  }
  if (updates.rejectEditRequest !== undefined) return unexpectedFieldsError();

  if (updates.rejectDeleteRequest === true) {
    if (!hasOnlyKeys(keys, ['rejectDeleteRequest'])) return unexpectedFieldsError();
    return rejectCancelIncidentService(id, actorUserId, actorRole);
  }
  if (updates.rejectDeleteRequest !== undefined) return unexpectedFieldsError();

  if (!hasOnlyKeys(keys, EDIT_FIELD_KEYS)) return unexpectedFieldsError();
  const editFields = pickEditPayload(updates);
  return editIncidentService(id, editFields, actorUserId, actorRole);
}
