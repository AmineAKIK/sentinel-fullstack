import { badRequest, forbidden, notFound, ok, ServiceResult } from '../../utils/serviceResult';
import { ANALYTICS_DEFAULT_WINDOW_DAYS } from '../../domain/constants';
import { withTransaction } from '../../db/transaction';
import { decodeCursor } from '../../utils/cursor';
import * as workshopRepository from './workshop.repository';
import * as arbitrationRepository from './workshop.arbitration.repository';
import type { ArbitrationRequestType } from './workshop.arbitration.repository';
import { logIncidentEvent } from './workshop.events';
import { UpdateIncidentInput } from './workshop.validation';

export {
  validateIncidentSelectionService,
  createIncidentService,
  editIncidentService,
  requestEditIncidentService,
  withdrawEditRequestService,
  approveEditIncidentService,
  rejectEditIncidentService,
} from './workshop.service.edit';

export {
  takeIncidentService,
  setPendingIncidentService,
  resumeIncidentService,
  closeIncidentService,
  invalidateIncidentService,
  setPriorityIncidentService,
  setResponsibleCommentService,
  requestCancelIncidentService,
  rejectCancelIncidentService,
  cancelIncidentService,
  followIncidentService,
  unfollowIncidentService,
} from './workshop.service.mutations';

import {
  EDIT_FIELD_KEYS,
  EDIT_FIELD_SET as _EDIT_FIELD_SET,
  definedUpdateKeys,
  hasOnlyKeys,
  unexpectedFieldsError,
  pickEditPayload,
  hasEditFields,
  editIncidentService,
  requestEditIncidentService,
  withdrawEditRequestService,
  approveEditIncidentService,
  rejectEditIncidentService,
} from './workshop.service.edit';

import {
  takeIncidentService,
  setPendingIncidentService,
  resumeIncidentService,
  closeIncidentService,
  invalidateIncidentService,
  setPriorityIncidentService,
  setResponsibleCommentService,
  requestCancelIncidentService,
  rejectCancelIncidentService,
} from './workshop.service.mutations';

// ─── Lecture / board / lignes ─────────────────────────────────────────────────

export async function getBoardDataService(): Promise<ServiceResult<unknown>> {
  return ok(await workshopRepository.getBoardData());
}

export async function listWorkshopLinesService(): Promise<ServiceResult<unknown>> {
  return ok(await workshopRepository.listActiveWorkshopLines());
}

export async function listIncidentsService(
  userId: number,
  role: string
): Promise<ServiceResult<unknown>> {
  return ok(await workshopRepository.listIncidents(userId, role));
}

// Décode le jeton opaque `cursor` d'une query en objet {sortValue, id} avant
// de la transmettre au repository — partagé par Historique, Connaissance et
// Journal (lot 7), même contrat de curseur pour les trois écrans.
function withDecodedCursor(
  query: Record<string, unknown>
): { ok: true; query: Record<string, unknown> } | { ok: false; error: ServiceResult<never> } {
  const { cursor: cursorToken, ...rest } = query;
  if (typeof cursorToken !== 'string' || !cursorToken) {
    return { ok: true, query: { ...rest, cursor: undefined } };
  }
  const decoded = decodeCursor(cursorToken);
  if (!decoded) return { ok: false, error: badRequest('Curseur de pagination invalide.') };
  return { ok: true, query: { ...rest, cursor: decoded } };
}

export async function listHistoryIncidentsService(
  query: Record<string, unknown>
): Promise<ServiceResult<unknown>> {
  const resolved = withDecodedCursor(query);
  if (!resolved.ok) return resolved.error;
  return ok(await workshopRepository.listIncidentWorkspaceRows(resolved.query, 'history'));
}

export async function getHistoryIncidentService(id: number): Promise<ServiceResult<unknown>> {
  const incident = await workshopRepository.fetchIncidentWithUsers(id);
  if (!incident) return notFound('Incident introuvable.');
  return { ok: true, data: incident };
}

export async function listKnowledgeIncidentsService(
  query: Record<string, unknown>
): Promise<ServiceResult<unknown>> {
  const resolved = withDecodedCursor(query);
  if (!resolved.ok) return resolved.error;
  return ok(await workshopRepository.listIncidentWorkspaceRows(resolved.query, 'knowledge'));
}

export async function getKnowledgeIncidentService(id: number): Promise<ServiceResult<unknown>> {
  const incident = await workshopRepository.fetchIncidentWithUsers(id);
  if (!incident || !workshopRepository.isKnowledgeEligible(incident)) {
    return notFound('Fiche connaissance introuvable.');
  }
  return { ok: true, data: incident };
}

export async function listHistoryEventsService(
  query: Record<string, unknown>,
  role: string
): Promise<ServiceResult<unknown>> {
  if (role !== 'RESPONSABLE') {
    return forbidden('Réservé au responsable atelier.');
  }
  const resolved = withDecodedCursor(query);
  if (!resolved.ok) return resolved.error;
  return ok(await workshopRepository.listHistoryEvents(resolved.query));
}

export async function listIncidentEventsService(id: number): Promise<ServiceResult<unknown>> {
  if (!(await workshopRepository.getIncidentStatus(id))) {
    return notFound('Incident introuvable.');
  }
  return ok(await workshopRepository.listIncidentEvents(id));
}

export async function getIncidentMetricsService(
  userId: number,
  role: string
): Promise<ServiceResult<unknown>> {
  return ok(await workshopRepository.getIncidentMetrics(userId, role));
}

export async function consultArbitrationRequestService(
  incidentId: number,
  actorUserId: number,
  actorRole: string,
  requestType: ArbitrationRequestType
): Promise<ServiceResult<{ consulted: number; incident: unknown }>> {
  if (actorRole !== 'RESPONSABLE') {
    return forbidden("Seul le responsable peut consulter un dossier d'arbitrage.");
  }

  const result = await withTransaction(async (client) => {
    const current = await workshopRepository.getIncidentById(incidentId, client);
    if (!current) return { kind: 'not_found' as const };

    const arbitration = await arbitrationRepository.getOpenArbitrationCase(incidentId, client);
    if (!arbitration || arbitration.request_type !== requestType) {
      return { kind: 'bad_request' as const };
    }
    if (arbitration.status === 'CONSULTED') {
      return { kind: 'ok' as const, consulted: 0 };
    }

    const consultedCase = await arbitrationRepository.consultArbitrationCase(
      incidentId,
      requestType,
      actorUserId,
      client
    );
    if (!consultedCase || consultedCase.status !== 'CONSULTED') {
      throw new Error("Échec de la transition de consultation de l'arbitrage.");
    }
    await logIncidentEvent(
      incidentId,
      actorUserId,
      'ARBITRATION_CONSULTED',
      { requestType, arbitrationCaseId: consultedCase.id },
      client
    );
    return { kind: 'ok' as const, consulted: 1 };
  });

  if (result.kind === 'not_found') return notFound('Incident introuvable.');
  if (result.kind === 'bad_request') {
    return badRequest("Aucun dossier d'arbitrage actif ne correspond à cette demande.");
  }

  const incident = await workshopRepository.fetchIncidentWithUsersForActor(incidentId, actorUserId);
  if (!incident) return notFound('Incident introuvable.');
  return ok({ consulted: result.consulted, incident });
}

export async function getWorkshopAnalyticsService(
  query: Record<string, unknown>
): Promise<ServiceResult<unknown>> {
  const boundedQuery = { ...query };
  if (!boundedQuery.start && !boundedQuery.end) {
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - ANALYTICS_DEFAULT_WINDOW_DAYS);
    boundedQuery.start = windowStart.toISOString();
  }
  return ok(await workshopRepository.getWorkshopAnalytics(boundedQuery));
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
  if (
    updates.status === 'INVALIDATED' ||
    (updates.status === 'CANCELED' && updates.invalidationReason !== undefined)
  ) {
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
  if (updates.requestOnly === true) {
    if (!hasOnlyKeys(keys, ['requestOnly', ...EDIT_FIELD_KEYS])) return unexpectedFieldsError();
    if (!hasEditFields(keys)) return badRequest('Aucune modification demandée.');
    const editPayload = pickEditPayload(updates);
    return requestEditIncidentService(id, editPayload, actorUserId, actorRole);
  }
  if (updates.requestOnly !== undefined) return unexpectedFieldsError();

  if (updates.cancelRequest === true || updates.deleteRequest === true) {
    if (
      !hasOnlyKeys(keys, [
        'cancelRequest',
        'cancelRequestReason',
        'deleteRequest',
        'deleteRequestReason',
      ])
    ) {
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

  if (updates.withdrawEditRequest === true) {
    if (!hasOnlyKeys(keys, ['withdrawEditRequest'])) return unexpectedFieldsError();
    return withdrawEditRequestService(id, actorUserId, actorRole);
  }
  if (updates.withdrawEditRequest !== undefined) return unexpectedFieldsError();

  if (!hasOnlyKeys(keys, EDIT_FIELD_KEYS)) return unexpectedFieldsError();
  const editFields = pickEditPayload(updates);
  return editIncidentService(id, editFields, actorUserId, actorRole);
}
