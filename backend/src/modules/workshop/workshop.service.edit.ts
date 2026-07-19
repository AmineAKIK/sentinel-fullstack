import {
  badRequest,
  conflict,
  forbidden,
  notFound,
  serviceError,
  ServiceResult,
} from '../../utils/serviceResult';
import { withTransaction } from '../../db/transaction';
import { logIncidentEvent } from './workshop.events';
import { canPerform, hasPendingArbitration } from './workshop.policy';
import * as workshopRepository from './workshop.repository';
import * as arbitrationRepository from './workshop.arbitration.repository';
import { CreateIncidentInput, UpdateIncidentInput } from './workshop.validation';
import { autoFollowForResponsable } from './workshop.service.mutations';

// ─── Helpers internes ─────────────────────────────────────────────────────────

export function requestedChangeKeys(changes: Record<string, unknown> | null | undefined): string[] {
  if (!changes) return [];
  return Object.keys(changes).filter((key) => changes[key] !== undefined);
}

export const EDIT_FIELD_KEYS = [
  'lineId',
  'machineId',
  'robotLabel',
  'headNumber',
  'state',
  'comment',
  'currentProduct',
] as const satisfies readonly (keyof UpdateIncidentInput)[];

export const EDIT_FIELD_SET = new Set<string>(EDIT_FIELD_KEYS);

type EditField = (typeof EDIT_FIELD_KEYS)[number];
type EditPayload = Partial<Pick<UpdateIncidentInput, EditField>>;

const INCIDENT_FIELD_BY_EDIT_FIELD = {
  lineId: 'line_id',
  machineId: 'machine_id',
  robotLabel: 'robot_label',
  headNumber: 'head_number',
  state: 'state',
  comment: 'comment',
  currentProduct: 'current_product',
} as const satisfies Record<EditField, keyof workshopRepository.WorkshopIncidentRow>;

function comparableEditValue(field: EditField, value: unknown): unknown {
  if (field === 'comment' && (value === null || value === '')) return null;
  return value;
}

function changedEditPayload(
  payload: EditPayload,
  current: workshopRepository.WorkshopIncidentRow
): EditPayload {
  const changes: EditPayload = {};

  for (const field of EDIT_FIELD_KEYS) {
    const next = payload[field];
    if (next === undefined) continue;

    const previous = current[INCIDENT_FIELD_BY_EDIT_FIELD[field]];
    if (Object.is(comparableEditValue(field, next), comparableEditValue(field, previous))) {
      continue;
    }
    changes[field] = next as never;
  }

  return changes;
}

export function definedUpdateKeys(updates: UpdateIncidentInput): string[] {
  return Object.keys(updates).filter(
    (key) => updates[key as keyof UpdateIncidentInput] !== undefined
  );
}

export function hasOnlyKeys(keys: string[], allowed: readonly string[]): boolean {
  const allowedSet = new Set(allowed);
  return keys.every((key) => allowedSet.has(key));
}

export function unexpectedFieldsError(): ServiceResult<never> {
  return badRequest("Payload de modification ambigu ou incompatible avec l'action demandée.");
}

export function pickEditPayload(
  updates: UpdateIncidentInput
): Pick<UpdateIncidentInput, (typeof EDIT_FIELD_KEYS)[number]> {
  const payload: Partial<Pick<UpdateIncidentInput, (typeof EDIT_FIELD_KEYS)[number]>> = {};
  for (const key of EDIT_FIELD_KEYS) {
    const value = updates[key];
    if (value !== undefined) {
      payload[key] = value as never;
    }
  }
  return payload;
}

export function hasEditFields(keys: string[]): boolean {
  return keys.some((key) => EDIT_FIELD_SET.has(key));
}

function getRobotOptions(
  machine: workshopRepository.StoredMachine
): { label: string; heads: number }[] {
  if (machine.hasDoubleRobot) {
    return [
      { label: `Gauche ${machine.leftRobotNumber}`, heads: machine.leftRobotHeads },
      { label: `Droite ${machine.rightRobotNumber}`, heads: machine.rightRobotHeads },
    ];
  }
  return [{ label: machine.robotNumber, heads: machine.robotHeads }];
}

function validateIncidentSelection(
  line: workshopRepository.ActiveWorkshopLine,
  data: {
    machineId: string;
    robotLabel: string;
    headNumber: number;
  }
): { lineNumber: string; machineBrand: string } | null {
  const machine = line.machines.find((item) => item.machineId === data.machineId);
  if (!machine) return null;

  const robot = getRobotOptions(machine).find((item) => item.label === data.robotLabel);
  if (!robot || data.headNumber < 1 || data.headNumber > robot.heads) return null;

  return { lineNumber: line.line_number, machineBrand: machine.brand };
}

function incidentSnapshotIsCurrent(
  context: workshopRepository.IncidentLineLockContext,
  incident: workshopRepository.LockedWorkshopIncidentRow
): boolean {
  return context.line_id === incident.line_id && context.row_version === incident.row_version;
}

function requestedTargetLineId(
  editRequest: Record<string, unknown> | null,
  fallbackLineId: number
): number {
  const requestedLineId = editRequest?.lineId;
  return typeof requestedLineId === 'number' && Number.isInteger(requestedLineId)
    ? requestedLineId
    : fallbackLineId;
}

function concurrentIncidentChange(): ServiceResult<never> {
  return conflict(
    'CONFLICT',
    "L'incident a été modifié simultanément. Rechargez le dossier puis réessayez."
  );
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
  return validateIncidentSelection(line, {
    machineId: data.machineId,
    robotLabel: data.robotLabel,
    headNumber: data.headNumber,
  });
}

// ─── Création ─────────────────────────────────────────────────────────────────

export async function createIncidentService(
  data: CreateIncidentInput,
  actorUserId: number,
  actorRole: string
): Promise<ServiceResult<unknown>> {
  const result = await withTransaction(async (client) => {
    const [line] = await workshopRepository.lockActiveWorkshopLines([data.lineId], client);
    if (!line) return { kind: 'line_not_found' as const };

    const machine = line.machines.find((item) => item.machineId === data.machineId);
    if (!machine) return { kind: 'invalid_machine' as const };

    const robot = getRobotOptions(machine).find((item) => item.label === data.robotLabel);
    if (!robot) return { kind: 'invalid_robot' as const };
    if (data.headNumber < 1 || data.headNumber > robot.heads) {
      return { kind: 'invalid_head' as const };
    }

    const id = await workshopRepository.createIncidentData(
      { actorUserId, data, line, machine, robotLabel: robot.label },
      client
    );
    await logIncidentEvent(
      id,
      actorUserId,
      'INCIDENT_CREATED',
      {
        lineNumber: line.line_number,
        machineId: machine.machineId,
        robotLabel: robot.label,
        headNumber: data.headNumber,
        state: data.state,
        hasComment: Boolean(data.comment?.trim()),
        hasCurrentProduct: Boolean(data.currentProduct?.trim()),
      },
      client
    );
    await autoFollowForResponsable(id, actorUserId, actorRole, client);
    return { kind: 'ok' as const, id };
  });

  if (result.kind === 'line_not_found') return notFound('Ligne introuvable ou inactive.');
  if (result.kind === 'invalid_machine') return badRequest('Machine invalide pour cette ligne.');
  if (result.kind === 'invalid_robot') return badRequest('Robot invalide pour cette machine.');
  if (result.kind === 'invalid_head') return badRequest('Tête invalide pour ce robot.');

  return {
    ok: true,
    data: await workshopRepository.fetchIncidentWithUsersForActor(result.id, actorUserId),
  };
}

// ─── Modification directe (DIRECT_EDIT / EDIT_AFTER_TAKE) ────────────────────

export async function editIncidentService(
  incidentId: number,
  updates: Pick<
    UpdateIncidentInput,
    'lineId' | 'machineId' | 'robotLabel' | 'headNumber' | 'state' | 'comment' | 'currentProduct'
  >,
  actorUserId: number,
  actorRole: string
): Promise<ServiceResult<unknown>> {
  const context = await workshopRepository.getIncidentLineLockContext(incidentId);
  if (!context) return notFound('Incident introuvable.');
  const requestedLineId = updates.lineId ?? context.line_id;

  const result = await withTransaction(async (client) => {
    const lockedLines = await workshopRepository.lockActiveWorkshopLines(
      [context.line_id, requestedLineId],
      client
    );
    const current = await workshopRepository.getIncidentById(incidentId, client);
    if (!current) return { kind: 'not_found' as const };
    if (!incidentSnapshotIsCurrent(context, current)) {
      return { kind: 'concurrent_change' as const };
    }
    const openArbitration = await arbitrationRepository.getOpenArbitrationCase(incidentId, client);
    if (openArbitration || hasPendingArbitration(current)) {
      return { kind: 'arbitration_required' as const };
    }

    if (
      !canPerform(actorRole, 'DIRECT_EDIT', current) &&
      !canPerform(actorRole, 'EDIT_AFTER_TAKE', current, actorUserId) &&
      !canPerform(actorRole, 'RESPONSABLE_EDIT', current)
    ) {
      return { kind: 'forbidden' as const };
    }

    const effectiveUpdates = changedEditPayload(updates, current);
    if (requestedChangeKeys(effectiveUpdates).length === 0) {
      return { kind: 'unchanged' as const, id: current.id };
    }

    const lineId = effectiveUpdates.lineId ?? current.line_id;
    const machineId = effectiveUpdates.machineId ?? current.machine_id;
    const robotLabel = effectiveUpdates.robotLabel ?? current.robot_label;
    const headNumber = effectiveUpdates.headNumber ?? current.head_number;

    const targetLine = lockedLines.find((line) => line.id === lineId);
    const selection = targetLine
      ? validateIncidentSelection(targetLine, {
          machineId,
          robotLabel,
          headNumber,
        })
      : null;
    if (!selection)
      return { kind: 'bad_request' as const, msg: 'Sélection ligne/machine/robot/tête invalide.' };

    const directChanges: Record<string, { old: unknown; new: unknown }> = {};
    if (effectiveUpdates.lineId !== undefined) {
      directChanges.lineId = { old: current.line_id, new: lineId };
      if (selection.lineNumber !== current.line_number) {
        directChanges.lineNumber = { old: current.line_number, new: selection.lineNumber };
      }
    }
    if (effectiveUpdates.machineId !== undefined) {
      directChanges.machineId = { old: current.machine_id, new: machineId };
      if (selection.machineBrand !== current.machine_brand) {
        directChanges.machineBrand = { old: current.machine_brand, new: selection.machineBrand };
      }
    }
    if (effectiveUpdates.robotLabel !== undefined)
      directChanges.robotLabel = { old: current.robot_label, new: robotLabel };
    if (effectiveUpdates.headNumber !== undefined)
      directChanges.headNumber = { old: current.head_number, new: headNumber };
    if (effectiveUpdates.state !== undefined)
      directChanges.state = { old: current.state, new: effectiveUpdates.state };
    if (effectiveUpdates.comment !== undefined)
      directChanges.comment = { old: current.comment, new: effectiveUpdates.comment };
    if (effectiveUpdates.currentProduct !== undefined)
      directChanges.currentProduct = {
        old: current.current_product,
        new: effectiveUpdates.currentProduct,
      };

    const id = await workshopRepository.updateIncidentData(
      {
        incidentId,
        current,
        updates: effectiveUpdates,
        role: actorRole,
        actorUserId,
        selection,
        lineId,
        machineId,
        robotLabel,
        headNumber,
      },
      client
    );
    if (!id) return { kind: 'not_found' as const };

    await logIncidentEvent(
      incidentId,
      actorUserId,
      'INCIDENT_UPDATED',
      {
        changes: directChanges,
        fields: Object.keys(directChanges),
      },
      client
    );
    await autoFollowForResponsable(incidentId, actorUserId, actorRole, client);
    return { kind: 'ok' as const, id };
  });

  if (result.kind === 'not_found') return notFound('Incident introuvable.');
  if (result.kind === 'concurrent_change') return concurrentIncidentChange();
  if (result.kind === 'arbitration_required')
    return conflict(
      'ARBITRATION_REQUIRED',
      "Une demande d'arbitrage doit être décidée avant de modifier cet incident."
    );
  if (result.kind === 'forbidden')
    return forbidden('Modification directe non autorisée pour ce rôle ou ce statut.');
  if (result.kind === 'bad_request') return badRequest(result.msg);
  return {
    ok: true,
    data: await workshopRepository.fetchIncidentWithUsersForActor(result.id, actorUserId),
  };
}

// ─── Demande d'édition (REQUEST_EDIT) ────────────────────────────────────────

export async function requestEditIncidentService(
  incidentId: number,
  editPayload: EditPayload,
  actorUserId: number,
  actorRole: string
): Promise<ServiceResult<unknown>> {
  const result = await withTransaction(async (client) => {
    const current = await workshopRepository.getIncidentById(incidentId, client);
    if (!current) return { kind: 'not_found' as const };
    const openArbitration = await arbitrationRepository.getOpenArbitrationCase(incidentId, client);
    if (openArbitration || hasPendingArbitration(current)) {
      return { kind: 'arbitration_pending' as const };
    }
    if (!canPerform(actorRole, 'REQUEST_EDIT', current, actorUserId))
      return { kind: 'forbidden' as const };
    if (requestedChangeKeys(editPayload).length === 0) {
      return { kind: 'bad_request' as const, msg: 'Aucune modification demandée.' };
    }
    const requestedChanges = changedEditPayload(editPayload, current);
    if (requestedChangeKeys(requestedChanges).length === 0) {
      return { kind: 'no_changes' as const };
    }

    const id = await workshopRepository.requestEditIncident(incidentId, requestedChanges, client);
    if (!id) return { kind: 'not_found' as const };
    const requestEventId = await logIncidentEvent(
      incidentId,
      actorUserId,
      'EDIT_REQUESTED',
      {
        changes: requestedChanges,
        fields: requestedChangeKeys(requestedChanges),
      },
      client
    );
    await arbitrationRepository.createArbitrationCase(
      {
        incidentId,
        requestEventId,
        requestType: 'EDIT',
        payload: requestedChanges,
        requestedByUserId: actorUserId,
      },
      client
    );
    return { kind: 'ok' as const, id };
  });

  if (result.kind === 'not_found') return notFound('Incident introuvable.');
  if (result.kind === 'arbitration_pending')
    return conflict(
      'ARBITRATION_ALREADY_PENDING',
      "Une demande d'arbitrage est déjà ouverte pour cet incident."
    );
  if (result.kind === 'forbidden')
    return forbidden('Demande de correction non autorisée pour ce statut.');
  if (result.kind === 'no_changes') {
    return serviceError(400, 'NO_CHANGES', "Aucune modification réelle n'a été détectée.");
  }
  if (result.kind === 'bad_request') return badRequest(result.msg);
  return {
    ok: true,
    data: await workshopRepository.fetchIncidentWithUsersForActor(result.id, actorUserId),
  };
}

// ─── Retrait demande d'édition (WITHDRAW_EDIT) ───────────────────────────────

export async function withdrawEditRequestService(
  incidentId: number,
  actorUserId: number,
  actorRole: string
): Promise<ServiceResult<unknown>> {
  const result = await withTransaction(async (client) => {
    const current = await workshopRepository.getIncidentById(incidentId, client);
    if (!current) return { kind: 'not_found' as const };
    const arbitration = await arbitrationRepository.getOpenArbitrationCase(incidentId, client);
    if (!arbitration || arbitration.request_type !== 'EDIT') {
      return { kind: 'bad_request' as const };
    }
    if (!canPerform(actorRole, 'WITHDRAW_EDIT', current, actorUserId))
      return { kind: 'forbidden' as const };

    const id = await workshopRepository.rejectEditIncident(incidentId, client);
    if (!id) return { kind: 'not_found' as const };
    await arbitrationRepository.resolveArbitrationCase(
      incidentId,
      'EDIT',
      'WITHDRAWN',
      actorUserId,
      'Retrait par le demandeur',
      client
    );
    await logIncidentEvent(
      incidentId,
      actorUserId,
      'EDIT_REQUEST_WITHDRAWN',
      {
        withdrawnBy: actorUserId,
      },
      client
    );
    return { kind: 'ok' as const, id };
  });

  if (result.kind === 'not_found') return notFound('Incident introuvable.');
  if (result.kind === 'forbidden') return forbidden('Retrait non autorisé.');
  if (result.kind === 'bad_request')
    return badRequest('Aucune demande de correction active à retirer.');
  return {
    ok: true,
    data: await workshopRepository.fetchIncidentWithUsersForActor(result.id, actorUserId),
  };
}

// ─── Approbation édition (APPROVE_EDIT) ──────────────────────────────────────

export async function approveEditIncidentService(
  incidentId: number,
  actorUserId: number,
  actorRole: string
): Promise<ServiceResult<unknown>> {
  const context = await workshopRepository.getIncidentLineLockContext(incidentId);
  if (!context) return notFound('Incident introuvable.');
  const requestedLineId = requestedTargetLineId(context.edit_request, context.line_id);

  const result = await withTransaction(async (client) => {
    const lockedLines = await workshopRepository.lockActiveWorkshopLines(
      [context.line_id, requestedLineId],
      client
    );
    const current = await workshopRepository.getIncidentById(incidentId, client);
    if (!current) return { kind: 'not_found' as const };
    if (!incidentSnapshotIsCurrent(context, current)) {
      return { kind: 'concurrent_change' as const };
    }
    const arbitration = await arbitrationRepository.getOpenArbitrationCase(incidentId, client);
    if (!arbitration || arbitration.request_type !== 'EDIT') {
      return { kind: 'bad_request' as const, msg: 'Aucune demande de modification à appliquer.' };
    }
    if (!canPerform(actorRole, 'APPROVE_EDIT', current)) return { kind: 'forbidden' as const };
    if (!current.edit_request)
      return { kind: 'bad_request' as const, msg: 'Aucune demande de modification à appliquer.' };

    const requested = current.edit_request as Record<string, unknown>;
    const lineId = (requested.lineId as number | undefined) ?? current.line_id;
    const targetLine = lockedLines.find((line) => line.id === lineId);
    const selection = targetLine
      ? validateIncidentSelection(targetLine, {
          machineId: (requested.machineId as string | undefined) ?? current.machine_id,
          robotLabel: (requested.robotLabel as string | undefined) ?? current.robot_label,
          headNumber: (requested.headNumber as number | undefined) ?? current.head_number,
        })
      : null;
    if (!selection)
      return { kind: 'bad_request' as const, msg: 'Sélection ligne/machine/robot/tête invalide.' };

    const id = await workshopRepository.applyEditRequestIncident(
      { incidentId, current, requested, selection },
      client
    );
    if (!id) return { kind: 'not_found' as const };
    await arbitrationRepository.resolveArbitrationCase(
      incidentId,
      'EDIT',
      'APPROVED',
      actorUserId,
      null,
      client
    );
    await logIncidentEvent(
      incidentId,
      actorUserId,
      'EDIT_APPLIED',
      {
        changes: requested,
        fields: requestedChangeKeys(requested),
      },
      client
    );
    await autoFollowForResponsable(incidentId, actorUserId, actorRole, client);
    return { kind: 'ok' as const, id };
  });

  if (result.kind === 'not_found') return notFound('Incident introuvable.');
  if (result.kind === 'concurrent_change') return concurrentIncidentChange();
  if (result.kind === 'forbidden')
    return forbidden('Seul le responsable peut appliquer une correction.');
  if (result.kind === 'bad_request') return badRequest(result.msg);
  return {
    ok: true,
    data: await workshopRepository.fetchIncidentWithUsersForActor(result.id, actorUserId),
  };
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
    const arbitration = await arbitrationRepository.getOpenArbitrationCase(incidentId, client);
    if (!arbitration || arbitration.request_type !== 'EDIT') {
      return { kind: 'bad_request' as const, msg: 'Aucune demande de modification à refuser.' };
    }
    if (!canPerform(actorRole, 'REJECT_EDIT', current)) return { kind: 'forbidden' as const };
    if (!current.edit_request)
      return { kind: 'bad_request' as const, msg: 'Aucune demande de modification à refuser.' };

    const id = await workshopRepository.rejectEditIncident(incidentId, client);
    if (!id) return { kind: 'not_found' as const };
    await arbitrationRepository.resolveArbitrationCase(
      incidentId,
      'EDIT',
      'REJECTED',
      actorUserId,
      null,
      client
    );
    await logIncidentEvent(
      incidentId,
      actorUserId,
      'EDIT_REJECTED',
      {
        rejectedFields: requestedChangeKeys(current.edit_request as Record<string, unknown> | null),
      },
      client
    );
    await autoFollowForResponsable(incidentId, actorUserId, actorRole, client);
    return { kind: 'ok' as const, id };
  });

  if (result.kind === 'not_found') return notFound('Incident introuvable.');
  if (result.kind === 'forbidden')
    return forbidden('Seul le responsable peut refuser une correction.');
  if (result.kind === 'bad_request') return badRequest(result.msg);
  return {
    ok: true,
    data: await workshopRepository.fetchIncidentWithUsersForActor(result.id, actorUserId),
  };
}
