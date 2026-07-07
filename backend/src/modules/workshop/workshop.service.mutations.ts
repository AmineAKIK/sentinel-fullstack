import { badRequest, forbidden, notFound, ServiceResult } from '../../utils/serviceResult';
import { withTransaction } from '../../db/transaction';
import { logIncidentEvent } from './workshop.events';
import { canPerform } from './workshop.policy';
import * as workshopRepository from './workshop.repository';
import {
  notifyFollowersIncidentTaken,
  notifyFollowersIncidentSetPending,
  notifyFollowersIncidentClosed,
  notifyFollowersIncidentCanceled,
  notifyMaintenanceIncidentUrgent,
  notifyTechnicianResponsibleComment,
  notifyTechnicianIncidentCanceled,
  notifyTechnicianIncidentInvalidated,
  notifyDeclarantIncidentTaken,
  notifyDeclarantCancelApproved,
  notifyDeclarantCancelRejected,
  notifyResponsablesCancelRequested,
} from '../notifications/notifications.service';

export async function autoFollowForResponsable(
  incidentId: number,
  actorUserId: number,
  actorRole: string,
  client: Parameters<typeof workshopRepository.followIncidentData>[2]
): Promise<void> {
  if (actorRole !== 'RESPONSABLE') return;
  await workshopRepository.followIncidentData(incidentId, actorUserId, client);
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

    const id = await workshopRepository.updateIncidentData(
      {
        incidentId,
        current,
        updates: { isTaken: true },
        role: actorRole,
        actorUserId,
        selection: { lineNumber: current.line_number, machineBrand: current.machine_brand },
        lineId: current.line_id,
        machineId: current.machine_id,
        robotLabel: current.robot_label,
        headNumber: current.head_number,
      },
      client
    );
    if (!id) return { kind: 'not_found' as const };
    await logIncidentEvent(
      incidentId,
      actorUserId,
      'INCIDENT_TAKEN',
      {
        previousTakenByUserId: current.taken_by_user_id,
      },
      client
    );
    return { kind: 'ok' as const, id };
  });

  if (result.kind === 'not_found') return notFound('Incident introuvable.');
  if (result.kind === 'forbidden')
    return forbidden('Prise en charge non autorisée pour ce rôle ou ce statut.');
  void notifyFollowersIncidentTaken(result.id, actorUserId);
  void notifyDeclarantIncidentTaken(result.id, actorUserId);
  return {
    ok: true,
    data: await workshopRepository.fetchIncidentWithUsersForActor(result.id, actorUserId),
  };
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
    if (!diagnostic?.trim() && !current.diagnostic)
      return { kind: 'bad_request' as const, msg: 'Diagnostic obligatoire avant suspension.' };

    const id = await workshopRepository.updateIncidentData(
      {
        incidentId,
        current,
        updates: { status: 'PENDING', diagnostic },
        role: actorRole,
        actorUserId,
        selection: { lineNumber: current.line_number, machineBrand: current.machine_brand },
        lineId: current.line_id,
        machineId: current.machine_id,
        robotLabel: current.robot_label,
        headNumber: current.head_number,
      },
      client
    );
    if (!id) return { kind: 'not_found' as const };
    await logIncidentEvent(
      incidentId,
      actorUserId,
      'INCIDENT_SET_PENDING',
      {
        from: current.status,
        to: 'PENDING',
        diagnostic: diagnostic ?? current.diagnostic,
      },
      client
    );
    return { kind: 'ok' as const, id };
  });

  if (result.kind === 'not_found') return notFound('Incident introuvable.');
  if (result.kind === 'forbidden')
    return forbidden('Suspension non autorisée pour ce rôle ou ce statut.');
  if (result.kind === 'bad_request') return badRequest(result.msg);
  void notifyFollowersIncidentSetPending(result.id, actorUserId, diagnostic ?? '');
  return {
    ok: true,
    data: await workshopRepository.fetchIncidentWithUsersForActor(result.id, actorUserId),
  };
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

    const id = await workshopRepository.updateIncidentData(
      {
        incidentId,
        current,
        updates: { status: 'OPEN' },
        role: actorRole,
        actorUserId,
        selection: { lineNumber: current.line_number, machineBrand: current.machine_brand },
        lineId: current.line_id,
        machineId: current.machine_id,
        robotLabel: current.robot_label,
        headNumber: current.head_number,
      },
      client
    );
    if (!id) return { kind: 'not_found' as const };
    await logIncidentEvent(
      incidentId,
      actorUserId,
      'INCIDENT_RESUMED',
      {
        from: 'PENDING',
        to: 'OPEN',
      },
      client
    );
    return { kind: 'ok' as const, id };
  });

  if (result.kind === 'not_found') return notFound('Incident introuvable.');
  if (result.kind === 'forbidden')
    return forbidden('Reprise non autorisée pour ce rôle ou ce statut.');
  return {
    ok: true,
    data: await workshopRepository.fetchIncidentWithUsersForActor(result.id, actorUserId),
  };
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
    if (current.status === 'PENDING')
      return {
        kind: 'bad_request' as const,
        msg: 'Impossible de clôturer un incident en attente.',
      };
    if (!interventionNote?.trim() && !current.intervention_note)
      return {
        kind: 'bad_request' as const,
        msg: 'Documentation intervention obligatoire avant clôture.',
      };

    const id = await workshopRepository.updateIncidentData(
      {
        incidentId,
        current,
        updates: { status: 'CLOSED', interventionNote },
        role: actorRole,
        actorUserId,
        selection: { lineNumber: current.line_number, machineBrand: current.machine_brand },
        lineId: current.line_id,
        machineId: current.machine_id,
        robotLabel: current.robot_label,
        headNumber: current.head_number,
      },
      client
    );
    if (!id) return { kind: 'not_found' as const };
    // Clear any pending edit request — incident is now closed.
    if (current.edit_request != null) {
      await workshopRepository.rejectEditIncident(incidentId, client);
    }
    await logIncidentEvent(
      incidentId,
      actorUserId,
      'INCIDENT_CLOSED',
      {
        from: current.status,
        to: 'CLOSED',
        interventionNote: interventionNote ?? current.intervention_note,
      },
      client
    );
    return { kind: 'ok' as const, id };
  });

  if (result.kind === 'not_found') return notFound('Incident introuvable.');
  if (result.kind === 'forbidden')
    return forbidden('Clôture non autorisée pour ce rôle ou ce statut.');
  if (result.kind === 'bad_request') return badRequest(result.msg);
  void notifyFollowersIncidentClosed(result.id, actorUserId);
  return {
    ok: true,
    data: await workshopRepository.fetchIncidentWithUsersForActor(result.id, actorUserId),
  };
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
    await logIncidentEvent(
      incidentId,
      actorUserId,
      'INCIDENT_INVALIDATED',
      {
        reason: invalidationReason.trim(),
        previousStatus: current.status,
      },
      client
    );
    // No auto-follow on INVALIDATED: the incident is permanently closed,
    // and RESPONSABLE already follows it from the CLOSE action.
    return { kind: 'ok' as const, id };
  });

  if (result.kind === 'not_found') return notFound('Incident introuvable.');
  if (result.kind === 'forbidden')
    return forbidden('Seul le responsable peut invalider un incident clôturé.');
  void notifyTechnicianIncidentInvalidated(result.id, actorUserId, invalidationReason.trim());
  return {
    ok: true,
    data: await workshopRepository.fetchIncidentWithUsersForActor(result.id, actorUserId),
  };
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

    const id = await workshopRepository.updateIncidentData(
      {
        incidentId,
        current,
        updates: { isPriority },
        role: actorRole,
        actorUserId,
        selection: { lineNumber: current.line_number, machineBrand: current.machine_brand },
        lineId: current.line_id,
        machineId: current.machine_id,
        robotLabel: current.robot_label,
        headNumber: current.head_number,
      },
      client
    );
    if (!id) return { kind: 'not_found' as const };
    await logIncidentEvent(
      incidentId,
      actorUserId,
      'PRIORITY_CHANGED',
      {
        from: current.is_priority,
        to: isPriority,
      },
      client
    );
    await autoFollowForResponsable(incidentId, actorUserId, actorRole, client);
    return { kind: 'ok' as const, id };
  });

  if (result.kind === 'not_found') return notFound('Incident introuvable.');
  if (result.kind === 'forbidden')
    return forbidden("Seul le responsable peut modifier la priorité d'un incident actif.");
  if (isPriority) void notifyMaintenanceIncidentUrgent(result.id, actorUserId);
  return {
    ok: true,
    data: await workshopRepository.fetchIncidentWithUsersForActor(result.id, actorUserId),
  };
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
    if (!canPerform(actorRole, 'RESPONSIBLE_COMMENT', current))
      return { kind: 'forbidden' as const };

    const id = await workshopRepository.updateIncidentData(
      {
        incidentId,
        current,
        updates: { responsibleComment },
        role: actorRole,
        actorUserId,
        selection: { lineNumber: current.line_number, machineBrand: current.machine_brand },
        lineId: current.line_id,
        machineId: current.machine_id,
        robotLabel: current.robot_label,
        headNumber: current.head_number,
      },
      client
    );
    if (!id) return { kind: 'not_found' as const };
    await logIncidentEvent(
      incidentId,
      actorUserId,
      'RESPONSIBLE_COMMENT_UPDATED',
      {
        from: current.responsible_comment,
        to: responsibleComment,
      },
      client
    );
    await autoFollowForResponsable(incidentId, actorUserId, actorRole, client);
    return { kind: 'ok' as const, id };
  });

  if (result.kind === 'not_found') return notFound('Incident introuvable.');
  if (result.kind === 'forbidden') return forbidden('Seul le responsable peut gérer la consigne.');
  void notifyTechnicianResponsibleComment(result.id, actorUserId, responsibleComment);
  return {
    ok: true,
    data: await workshopRepository.fetchIncidentWithUsersForActor(result.id, actorUserId),
  };
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
    if (!canPerform(actorRole, 'REQUEST_CANCEL', current, actorUserId))
      return { kind: 'forbidden' as const };

    const id = await workshopRepository.requestCancelIncident(incidentId, reason.trim(), client);
    if (!id) return { kind: 'not_found' as const };
    await logIncidentEvent(
      incidentId,
      actorUserId,
      'CANCEL_REQUESTED',
      {
        reason: reason.trim(),
        status: current.status,
      },
      client
    );
    return { kind: 'ok' as const, id };
  });

  if (result.kind === 'not_found') return notFound('Incident introuvable.');
  if (result.kind === 'forbidden')
    return forbidden("Demande d'annulation non autorisée pour ce rôle ou ce statut.");
  void notifyResponsablesCancelRequested(result.id, actorUserId, reason.trim());
  return {
    ok: true,
    data: await workshopRepository.fetchIncidentWithUsersForActor(result.id, actorUserId),
  };
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
    await logIncidentEvent(
      incidentId,
      actorUserId,
      'CANCEL_REQUEST_REJECTED',
      {
        requestedReason: current.cancel_request_reason,
      },
      client
    );
    await autoFollowForResponsable(incidentId, actorUserId, actorRole, client);
    return { kind: 'ok' as const, id };
  });

  if (result.kind === 'not_found') return notFound('Incident introuvable.');
  if (result.kind === 'forbidden')
    return forbidden('Seul le responsable peut refuser une annulation.');
  if (result.kind === 'bad_request') return badRequest(result.msg);
  void notifyDeclarantCancelRejected(result.id, actorUserId);
  return {
    ok: true,
    data: await workshopRepository.fetchIncidentWithUsersForActor(result.id, actorUserId),
  };
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

    const action =
      actorRole === 'RESPONSABLE' && canPerform(actorRole, 'APPROVE_CANCEL', incident)
        ? 'APPROVE_CANCEL'
        : 'CANCEL';
    if (!canPerform(actorRole, action, incident)) return { kind: 'forbidden' as const };

    const ok = await workshopRepository.cancelIncidentData(incidentId, client);
    if (!ok) return { kind: 'not_found' as const };

    await logIncidentEvent(
      incidentId,
      actorUserId,
      'INCIDENT_CANCELED',
      {
        mode: action === 'APPROVE_CANCEL' ? 'request_approved' : 'direct',
        requestedReason: incident.cancel_request_reason ?? incident.delete_request_reason,
        previousStatus: incident.status,
      },
      client
    );
    await autoFollowForResponsable(incidentId, actorUserId, actorRole, client);
    return { kind: 'ok' as const, mode: action, takenByUserId: incident.taken_by_user_id };
  });

  if (result.kind === 'not_found') return notFound('Incident introuvable.');
  if (result.kind === 'forbidden')
    return forbidden('Annulation non autorisée pour ce rôle ou ce statut.');
  void notifyFollowersIncidentCanceled(incidentId, actorUserId);
  if (result.takenByUserId) void notifyTechnicianIncidentCanceled(incidentId, actorUserId);
  if (result.mode === 'APPROVE_CANCEL') void notifyDeclarantCancelApproved(incidentId, actorUserId);
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
  if (
    incident.status === 'CLOSED' ||
    incident.status === 'CANCELED' ||
    incident.status === 'INVALIDATED'
  ) {
    return forbidden('Impossible de suivre un incident terminé.');
  }

  await withTransaction(async (client) => {
    await workshopRepository.followIncidentData(incidentId, actorUserId, client);
    await logIncidentEvent(incidentId, actorUserId, 'INCIDENT_FOLLOWED', {}, client);
  });

  return {
    ok: true,
    data: await workshopRepository.fetchIncidentWithUsersForActor(incidentId, actorUserId),
  };
}

export async function unfollowIncidentService(
  incidentId: number,
  actorUserId: number,
  actorRole: string
): Promise<ServiceResult<unknown>> {
  if (actorRole !== 'RESPONSABLE') return forbidden('Seul le responsable peut retirer un suivi.');
  if (!(await workshopRepository.incidentExists(incidentId)))
    return notFound('Incident introuvable.');

  await withTransaction(async (client) => {
    await workshopRepository.unfollowIncidentData(incidentId, actorUserId, client);
    await logIncidentEvent(incidentId, actorUserId, 'INCIDENT_UNFOLLOWED', {}, client);
  });

  return {
    ok: true,
    data: await workshopRepository.fetchIncidentWithUsersForActor(incidentId, actorUserId),
  };
}
