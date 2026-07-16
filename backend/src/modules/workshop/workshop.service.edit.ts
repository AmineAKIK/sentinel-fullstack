import {
  badRequest,
  conflict,
  forbidden,
  notFound,
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
  if (data.headNumber < 1 || data.headNumber > robot.heads)
    return badRequest('Tête invalide pour ce robot.');

  const incidentId = await withTransaction(async (client) => {
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
    return id;
  });

  return {
    ok: true,
    data: await workshopRepository.fetchIncidentWithUsersForActor(incidentId, actorUserId),
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
  const result = await withTransaction(async (client) => {
    const current = await workshopRepository.getIncidentById(incidentId, client);
    if (!current) return { kind: 'not_found' as const };
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

    const lineId = updates.lineId ?? current.line_id;
    const machineId = updates.machineId ?? current.machine_id;
    const robotLabel = updates.robotLabel ?? current.robot_label;
    const headNumber = updates.headNumber ?? current.head_number;

    const selection = await validateIncidentSelectionService({
      lineId,
      machineId,
      robotLabel,
      headNumber,
    });
    if (!selection)
      return { kind: 'bad_request' as const, msg: 'Sélection ligne/machine/robot/tête invalide.' };

    const directChanges: Record<string, { old: unknown; new: unknown }> = {};
    if (updates.lineId !== undefined && updates.lineId !== current.line_id) {
      directChanges.lineId = { old: current.line_id, new: lineId };
      directChanges.lineNumber = { old: current.line_number, new: selection.lineNumber };
    }
    if (updates.machineId !== undefined && updates.machineId !== current.machine_id) {
      directChanges.machineId = { old: current.machine_id, new: machineId };
      directChanges.machineBrand = { old: current.machine_brand, new: selection.machineBrand };
    }
    if (updates.robotLabel !== undefined && updates.robotLabel !== current.robot_label)
      directChanges.robotLabel = { old: current.robot_label, new: robotLabel };
    if (updates.headNumber !== undefined && updates.headNumber !== current.head_number)
      directChanges.headNumber = { old: current.head_number, new: headNumber };
    if (updates.state !== undefined && updates.state !== current.state)
      directChanges.state = { old: current.state, new: updates.state };
    if (updates.comment !== undefined && updates.comment !== current.comment)
      directChanges.comment = { old: current.comment, new: updates.comment };
    if (updates.currentProduct !== undefined && updates.currentProduct !== current.current_product)
      directChanges.currentProduct = { old: current.current_product, new: updates.currentProduct };

    const id = await workshopRepository.updateIncidentData(
      {
        incidentId,
        current,
        updates,
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
  editPayload: Record<string, unknown>,
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
    if (Object.keys(editPayload).length === 0)
      return { kind: 'bad_request' as const, msg: 'Aucune modification demandée.' };

    const id = await workshopRepository.requestEditIncident(incidentId, editPayload, client);
    if (!id) return { kind: 'not_found' as const };
    const requestEventId = await logIncidentEvent(
      incidentId,
      actorUserId,
      'EDIT_REQUESTED',
      {
        changes: editPayload,
        fields: requestedChangeKeys(editPayload),
      },
      client
    );
    await arbitrationRepository.createArbitrationCase(
      {
        incidentId,
        requestEventId,
        requestType: 'EDIT',
        payload: editPayload,
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
  const result = await withTransaction(async (client) => {
    const current = await workshopRepository.getIncidentById(incidentId, client);
    if (!current) return { kind: 'not_found' as const };
    const arbitration = await arbitrationRepository.getOpenArbitrationCase(incidentId, client);
    if (!arbitration || arbitration.request_type !== 'EDIT') {
      return { kind: 'bad_request' as const, msg: 'Aucune demande de modification à appliquer.' };
    }
    if (!canPerform(actorRole, 'APPROVE_EDIT', current)) return { kind: 'forbidden' as const };
    if (!current.edit_request)
      return { kind: 'bad_request' as const, msg: 'Aucune demande de modification à appliquer.' };

    const requested = current.edit_request as Record<string, unknown>;
    const selection = await validateIncidentSelectionService({
      lineId: (requested.lineId as number | undefined) ?? current.line_id,
      machineId: (requested.machineId as string | undefined) ?? current.machine_id,
      robotLabel: (requested.robotLabel as string | undefined) ?? current.robot_label,
      headNumber: (requested.headNumber as number | undefined) ?? current.head_number,
    });
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
