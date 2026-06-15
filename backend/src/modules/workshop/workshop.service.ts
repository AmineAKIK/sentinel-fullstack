import { badRequest, notFound, ServiceResult } from '../../utils/serviceResult';
import * as workshopRepository from './workshop.repository';
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
  setDisplayOrderIncidentService,
  requestCancelIncidentService,
  rejectCancelIncidentService,
  cancelIncidentService,
  followIncidentService,
  unfollowIncidentService,
  reorderIncidentsService,
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
  setDisplayOrderIncidentService,
  requestCancelIncidentService,
  rejectCancelIncidentService,
} from './workshop.service.mutations';

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
    return requestEditIncidentService(id, editPayload, actorUserId, actorRole);
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

  if (updates.withdrawEditRequest === true) {
    if (!hasOnlyKeys(keys, ['withdrawEditRequest'])) return unexpectedFieldsError();
    return withdrawEditRequestService(id, actorUserId, actorRole);
  }
  if (updates.withdrawEditRequest !== undefined) return unexpectedFieldsError();

  if (!hasOnlyKeys(keys, EDIT_FIELD_KEYS)) return unexpectedFieldsError();
  const editFields = pickEditPayload(updates);
  return editIncidentService(id, editFields, actorUserId, actorRole);
}
