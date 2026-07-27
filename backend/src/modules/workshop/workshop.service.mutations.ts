import {
  badRequest,
  conflict,
  forbidden,
  notFound,
  ServiceResult,
} from '../../utils/serviceResult';
import { withTransaction } from '../../db/transaction';
import { FIELD_LIMITS } from '../../domain/constants';
import { logIncidentEvent } from './workshop.events';
import { canPerform, hasCancelRequest, hasPendingArbitration } from './workshop.policy';
import * as workshopRepository from './workshop.repository';
import * as arbitrationRepository from './workshop.arbitration.repository';
import type { WorkshopIncidentRow } from './workshop.repository';

// La plupart des mutations de workflow (TAKE, SET_PENDING, RESUME, CLOSE,
// SET_PRIORITY, RESPONSIBLE_COMMENT) ne changent aucun champ de sélection
// (ligne/machine/robot/tête) : updateIncidentData les exige quand même car
// il réécrit toute la ligne. Ce helper évite de recopier les 5 champs à
// l'identique à chaque appel.
function unchangedSelectionFields(current: WorkshopIncidentRow) {
  return {
    selection: { lineNumber: current.line_number, machineBrand: current.machine_brand },
    lineId: current.line_id,
    machineId: current.machine_id,
    robotLabel: current.robot_label,
    headNumber: current.head_number,
  };
}

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
    // Global lock order: line(s), user, incident. TAKE has no line dependency,
    // so the assignee must be locked and revalidated before the incident.
    const assignee = await workshopRepository.lockWorkshopAssignee(actorUserId, client);
    if (
      !assignee ||
      !assignee.is_active ||
      assignee.is_deleted ||
      assignee.role !== 'MAINTENANCE' ||
      assignee.role !== actorRole
    ) {
      return { kind: 'forbidden' as const };
    }

    const current = await workshopRepository.getIncidentById(incidentId, client);
    if (!current) return { kind: 'not_found' as const };
    const openArbitration = await arbitrationRepository.getOpenArbitrationCase(incidentId, client);
    if (openArbitration || hasPendingArbitration(current)) {
      return { kind: 'arbitration_required' as const };
    }
    if (!canPerform(assignee.role, 'TAKE', current, actorUserId)) {
      return { kind: 'forbidden' as const };
    }

    const id = await workshopRepository.updateIncidentData(
      {
        incidentId,
        current,
        updates: { isTaken: true },
        role: assignee.role,
        actorUserId,
        ...unchangedSelectionFields(current),
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
  if (result.kind === 'arbitration_required') return arbitrationRequiredResult();
  if (result.kind === 'forbidden')
    return forbidden('Prise en charge non autorisée pour ce rôle ou ce statut.');
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
    const openArbitration = await arbitrationRepository.getOpenArbitrationCase(incidentId, client);
    if (openArbitration || hasPendingArbitration(current)) {
      return { kind: 'arbitration_required' as const };
    }
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
        ...unchangedSelectionFields(current),
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
  if (result.kind === 'arbitration_required') return arbitrationRequiredResult();
  if (result.kind === 'forbidden')
    return forbidden('Suspension non autorisée pour ce rôle ou ce statut.');
  if (result.kind === 'bad_request') return badRequest(result.msg);
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
    const openArbitration = await arbitrationRepository.getOpenArbitrationCase(incidentId, client);
    if (openArbitration || hasPendingArbitration(current)) {
      return { kind: 'arbitration_required' as const };
    }
    if (!canPerform(actorRole, 'RESUME', current)) return { kind: 'forbidden' as const };

    const id = await workshopRepository.updateIncidentData(
      {
        incidentId,
        current,
        updates: { status: 'OPEN' },
        role: actorRole,
        actorUserId,
        ...unchangedSelectionFields(current),
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
  if (result.kind === 'arbitration_required') return arbitrationRequiredResult();
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
    const openArbitration = await arbitrationRepository.getOpenArbitrationCase(incidentId, client);
    if (openArbitration || hasPendingArbitration(current)) {
      return { kind: 'arbitration_required' as const };
    }
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
        ...unchangedSelectionFields(current),
      },
      client
    );
    if (!id) return { kind: 'not_found' as const };
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
  if (result.kind === 'arbitration_required') return arbitrationRequiredResult();
  if (result.kind === 'forbidden')
    return forbidden('Clôture non autorisée pour ce rôle ou ce statut.');
  if (result.kind === 'bad_request') return badRequest(result.msg);
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
    if (current.is_priority === isPriority) {
      return { kind: 'ok' as const, id: incidentId, changed: false };
    }

    const id = await workshopRepository.updateIncidentData(
      {
        incidentId,
        current,
        updates: { isPriority },
        role: actorRole,
        actorUserId,
        ...unchangedSelectionFields(current),
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
    return { kind: 'ok' as const, id, changed: true };
  });

  if (result.kind === 'not_found') return notFound('Incident introuvable.');
  if (result.kind === 'forbidden')
    return forbidden("Seul le responsable peut modifier la priorité d'un incident actif.");
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
  const normalizedComment = responsibleComment.trim();
  const result = await withTransaction(async (client) => {
    const current = await workshopRepository.getIncidentById(incidentId, client);
    if (!current) return { kind: 'not_found' as const };
    if (!canPerform(actorRole, 'RESPONSIBLE_COMMENT', current))
      return { kind: 'forbidden' as const };
    if ((current.responsible_comment ?? '') === normalizedComment) {
      return { kind: 'ok' as const, id: incidentId, changed: false };
    }

    const id = await workshopRepository.updateIncidentData(
      {
        incidentId,
        current,
        updates: { responsibleComment: normalizedComment },
        role: actorRole,
        actorUserId,
        ...unchangedSelectionFields(current),
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
        to: normalizedComment || null,
      },
      client
    );
    await autoFollowForResponsable(incidentId, actorUserId, actorRole, client);
    return { kind: 'ok' as const, id, changed: true };
  });

  if (result.kind === 'not_found') return notFound('Incident introuvable.');
  if (result.kind === 'forbidden') return forbidden('Seul le responsable peut gérer la consigne.');
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
    const openArbitration = await arbitrationRepository.getOpenArbitrationCase(incidentId, client);
    if (openArbitration || hasPendingArbitration(current)) {
      return { kind: 'arbitration_pending' as const };
    }
    if (!canPerform(actorRole, 'REQUEST_CANCEL', current, actorUserId))
      return { kind: 'forbidden' as const };

    const id = await workshopRepository.requestCancelIncident(incidentId, reason.trim(), client);
    if (!id) return { kind: 'not_found' as const };
    const requestEventId = await logIncidentEvent(
      incidentId,
      actorUserId,
      'CANCEL_REQUESTED',
      {
        reason: reason.trim(),
        status: current.status,
      },
      client
    );
    await arbitrationRepository.createArbitrationCase(
      {
        incidentId,
        requestEventId,
        requestType: 'CANCEL',
        reason: reason.trim(),
        requestedByUserId: actorUserId,
      },
      client
    );
    return { kind: 'ok' as const, id };
  });

  if (result.kind === 'not_found') return notFound('Incident introuvable.');
  if (result.kind === 'arbitration_pending') {
    return conflict(
      'ARBITRATION_ALREADY_PENDING',
      "Une demande d'arbitrage est déjà ouverte pour cet incident."
    );
  }
  if (result.kind === 'forbidden')
    return forbidden("Demande d'annulation non autorisée pour ce rôle ou ce statut.");
  return {
    ok: true,
    data: await workshopRepository.fetchIncidentWithUsersForActor(result.id, actorUserId),
  };
}

// ─── Retrait annulation par le demandeur (WITHDRAW_CANCEL) ───────────────────

export async function withdrawCancelIncidentService(
  incidentId: number,
  actorUserId: number,
  actorRole: string
): Promise<ServiceResult<unknown>> {
  const result = await withTransaction(async (client) => {
    const current = await workshopRepository.getIncidentById(incidentId, client);
    if (!current) return { kind: 'not_found' as const };
    const arbitration = await arbitrationRepository.getOpenArbitrationCase(incidentId, client);
    if (!arbitration || arbitration.request_type !== 'CANCEL') {
      return { kind: 'bad_request' as const };
    }
    // Seul le demandeur, tant que la demande est en attente. La policy vérifie
    // l'appartenance ; l'existence d'un arbitrage CANCEL ouvert garantit le WAITING.
    if (!canPerform(actorRole, 'WITHDRAW_CANCEL', current, actorUserId))
      return { kind: 'forbidden' as const };

    // Résout d'ABORD l'arbitrage : c'est la garde d'unicité. Sous verrou de ligne
    // (getIncidentById FOR UPDATE), une seule transaction concurrente peut faire
    // passer le cas de ACTIVE/CONSULTED à WITHDRAWN. Si aucune ligne n'est
    // résolue, une opération concurrente (refus ou confirmation) a déjà tranché :
    // on perd la course proprement, sans effet de bord.
    const resolvedCaseId = await arbitrationRepository.resolveArbitrationCase(
      incidentId,
      'CANCEL',
      'WITHDRAWN',
      actorUserId,
      'Retrait par le demandeur',
      client
    );
    if (resolvedCaseId === null) return { kind: 'already_resolved' as const };

    const id = await workshopRepository.rejectCancelIncident(incidentId, client);
    if (!id) return { kind: 'not_found' as const };
    await logIncidentEvent(
      incidentId,
      actorUserId,
      'CANCEL_REQUEST_WITHDRAWN',
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
    return badRequest("Aucune demande d'annulation active à retirer.");
  if (result.kind === 'already_resolved') {
    // Course perdue : une décision concurrente (refus/confirmation) a déjà tranché.
    return conflict('CONFLICT', "Cette demande d'annulation a déjà été traitée.");
  }
  return {
    ok: true,
    data: await workshopRepository.fetchIncidentWithUsersForActor(result.id, actorUserId),
  };
}

// ─── Refus annulation (REJECT_CANCEL) ────────────────────────────────────────

export async function rejectCancelIncidentService(
  incidentId: number,
  actorUserId: number,
  actorRole: string,
  decisionReason: string
): Promise<ServiceResult<unknown>> {
  // Motif de refus OBLIGATOIRE (RC3 §6), aligné sur le refus de correction (lot 4).
  // Erreur structurée avec un champ public stable (decisionReason).
  const reason = (decisionReason ?? '').trim();
  if (reason.length === 0) {
    return badRequest('Un motif de refus est obligatoire.', {
      field: 'decisionReason',
      reason: 'REQUIRED',
    });
  }
  if (reason.length > FIELD_LIMITS.COMMENT) {
    return badRequest('Le motif de refus est trop long.', {
      field: 'decisionReason',
      reason: 'TOO_LONG',
      max: FIELD_LIMITS.COMMENT,
    });
  }
  const result = await withTransaction(async (client) => {
    const current = await workshopRepository.getIncidentById(incidentId, client);
    if (!current) return { kind: 'not_found' as const };
    const arbitration = await arbitrationRepository.getOpenArbitrationCase(incidentId, client);
    if (!arbitration || arbitration.request_type !== 'CANCEL') {
      return { kind: 'bad_request' as const, msg: "Aucune demande d'annulation à refuser." };
    }
    if (!canPerform(actorRole, 'REJECT_CANCEL', current)) return { kind: 'forbidden' as const };
    if (!hasCancelRequest(current)) {
      return { kind: 'bad_request' as const, msg: "Aucune demande d'annulation à refuser." };
    }

    // Garde d'unicité : résoudre l'arbitrage d'abord (une seule transaction sous
    // verrou peut faire ACTIVE/CONSULTED → REJECTED). Sinon course perdue.
    const resolvedCaseId = await arbitrationRepository.resolveArbitrationCase(
      incidentId,
      'CANCEL',
      'REJECTED',
      actorUserId,
      reason,
      client
    );
    if (resolvedCaseId === null) return { kind: 'already_resolved' as const };
    const id = await workshopRepository.rejectCancelIncident(incidentId, client);
    if (!id) return { kind: 'not_found' as const };
    await logIncidentEvent(
      incidentId,
      actorUserId,
      'CANCEL_REQUEST_REJECTED',
      {
        requestedReason: current.cancel_request_reason,
        decisionReason: reason,
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
  if (result.kind === 'already_resolved') {
    return conflict('CONFLICT', "Cette demande d'annulation a déjà été traitée.");
  }
  return {
    ok: true,
    data: await workshopRepository.fetchIncidentWithUsersForActor(result.id, actorUserId),
  };
}

// ─── Annulation directe (CANCEL / APPROVE_CANCEL) ────────────────────────────

export async function cancelIncidentService(
  incidentId: number,
  actorUserId: number,
  actorRole: string,
  // 'approve' : confirmer une demande d'annulation précise (depuis la modale
  // d'arbitrage) — si cette demande a disparu (retrait/refus concurrent), l'action
  // échoue proprement au lieu de basculer en annulation directe. 'direct' :
  // annulation directe autorisée (RESPONSABLE/MAINTENANCE selon la policy).
  expectation: 'approve' | 'direct' | 'any' = 'any'
): Promise<ServiceResult<{ message: string }>> {
  const result = await withTransaction(async (client) => {
    const incident = await workshopRepository.getIncidentCancelSnapshot(incidentId, client);
    if (!incident) return { kind: 'not_found' as const };
    const arbitration = await arbitrationRepository.getOpenArbitrationCase(incidentId, client);

    // Confirmation d'une demande précise : si la demande d'annulation n'est plus
    // ouverte (retrait/refus concurrent), on ne bascule PAS en annulation directe.
    if (expectation === 'approve' && (!arbitration || arbitration.request_type !== 'CANCEL')) {
      return { kind: 'already_resolved' as const };
    }

    if (arbitration && arbitration.request_type !== 'CANCEL') {
      return { kind: 'arbitration_required' as const };
    }

    const action =
      actorRole === 'RESPONSABLE' &&
      arbitration?.request_type === 'CANCEL' &&
      canPerform(actorRole, 'APPROVE_CANCEL', incident)
        ? 'APPROVE_CANCEL'
        : 'CANCEL';
    if (arbitration && action !== 'APPROVE_CANCEL') {
      return { kind: 'arbitration_required' as const };
    }
    if (!canPerform(actorRole, action, incident)) return { kind: 'forbidden' as const };

    // En approbation d'une demande, on résout l'arbitrage EN PREMIER : c'est la
    // garde d'unicité sous verrou de ligne. Si aucune ligne ACTIVE/CONSULTED
    // n'est résolue, une opération concurrente (retrait/refus) a déjà tranché —
    // on n'annule PAS l'incident et on perd la course proprement.
    if (action === 'APPROVE_CANCEL') {
      const resolvedCaseId = await arbitrationRepository.resolveArbitrationCase(
        incidentId,
        'CANCEL',
        'APPROVED',
        actorUserId,
        null,
        client
      );
      if (resolvedCaseId === null) return { kind: 'already_resolved' as const };
    }

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
  if (result.kind === 'arbitration_required') return arbitrationRequiredResult();
  if (result.kind === 'forbidden')
    return forbidden('Annulation non autorisée pour ce rôle ou ce statut.');
  if (result.kind === 'already_resolved') {
    return conflict('CONFLICT', "Cette demande d'annulation a déjà été traitée.");
  }
  return { ok: true, data: { message: 'Incident annulé.' } };
}

function arbitrationRequiredResult(): ServiceResult<never> {
  return conflict(
    'ARBITRATION_REQUIRED',
    "Une demande d'arbitrage doit être décidée avant de poursuivre le traitement."
  );
}

// ─── Suivi (FOLLOW / UNFOLLOW) ────────────────────────────────────────────────

export async function followIncidentService(
  incidentId: number,
  actorUserId: number,
  actorRole: string
): Promise<ServiceResult<unknown>> {
  if (actorRole !== 'RESPONSABLE') return forbidden('Seul le responsable peut suivre un incident.');

  const result = await withTransaction(async (client) => {
    const current = await workshopRepository.getIncidentById(incidentId, client);
    if (!current) return { kind: 'not_found' as const };
    if (
      current.status === 'CLOSED' ||
      current.status === 'CANCELED' ||
      current.status === 'INVALIDATED'
    ) {
      return { kind: 'forbidden' as const };
    }

    const changed = await workshopRepository.followIncidentData(incidentId, actorUserId, client);
    if (changed) {
      await logIncidentEvent(incidentId, actorUserId, 'INCIDENT_FOLLOWED', {}, client);
    }
    return { kind: 'ok' as const };
  });

  if (result.kind === 'not_found') return notFound('Incident introuvable.');
  if (result.kind === 'forbidden') return forbidden('Impossible de suivre un incident terminé.');

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

  const result = await withTransaction(async (client) => {
    const current = await workshopRepository.getIncidentById(incidentId, client);
    if (!current) return { kind: 'not_found' as const };

    const changed = await workshopRepository.unfollowIncidentData(incidentId, actorUserId, client);
    if (changed) {
      await logIncidentEvent(incidentId, actorUserId, 'INCIDENT_UNFOLLOWED', {}, client);
    }
    return { kind: 'ok' as const };
  });

  if (result.kind === 'not_found') return notFound('Incident introuvable.');

  return {
    ok: true,
    data: await workshopRepository.fetchIncidentWithUsersForActor(incidentId, actorUserId),
  };
}
