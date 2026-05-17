import { Request, Response } from 'express';
import {
  formatZodError,
  handleControllerError,
  parseIdParam,
  sendServiceError,
} from '../../utils/controller';
import { sendError } from '../../utils/errors';
import {
  approveEditIncidentService,
  cancelIncidentService,
  closeIncidentService,
  createIncidentService,
  editIncidentService,
  followIncidentService,
  getBoardDataService,
  getHistoryIncidentService,
  getIncidentMetricsService,
  getKnowledgeIncidentService,
  getWorkshopAnalyticsService,
  invalidateIncidentService,
  listHistoryEventsService,
  listHistoryIncidentsService,
  listIncidentEventsService,
  listIncidentsService,
  listKnowledgeIncidentsService,
  listWorkshopLinesService,
  rejectCancelIncidentService,
  rejectEditIncidentService,
  reorderIncidentsService,
  requestCancelIncidentService,
  requestEditIncidentService,
  resumeIncidentService,
  setDisplayOrderIncidentService,
  setPendingIncidentService,
  setPriorityIncidentService,
  setResponsibleCommentService,
  takeIncidentService,
  unfollowIncidentService,
} from './workshop.service';
import {
  createIncidentSchema,
  incidentWorkspaceQuerySchema,
  reorderIncidentsSchema,
  updateIncidentSchema,
  workshopAnalyticsQuerySchema,
} from './workshop.validation';

export async function getBoardData(_req: Request, res: Response): Promise<void> {
  try {
    res.json(await getBoardDataService());
  } catch (err) {
    handleControllerError(res, 'getBoardData', err);
  }
}

export async function listWorkshopLines(_req: Request, res: Response): Promise<void> {
  try {
    res.json(await listWorkshopLinesService());
  } catch (err) {
    handleControllerError(res, 'listWorkshopLines', err);
  }
}

export async function listIncidents(req: Request, res: Response): Promise<void> {
  try {
    res.json(await listIncidentsService(req.workshopUser!.userId, req.workshopUser!.role));
  } catch (err) {
    handleControllerError(res, 'listIncidents', err);
  }
}

export async function listHistoryIncidents(req: Request, res: Response): Promise<void> {
  try {
    const parsed = incidentWorkspaceQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      sendError(res, 400, 'VALIDATION_ERROR', formatZodError(parsed.error));
      return;
    }
    res.json(await listHistoryIncidentsService(parsed.data));
  } catch (err) {
    handleControllerError(res, 'listHistoryIncidents', err);
  }
}

export async function getHistoryIncident(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIdParam(req.params.id);
    if (sendServiceError(res, id)) return;
    const result = await getHistoryIncidentService(id.data);
    if (sendServiceError(res, result)) return;
    res.json(result.data);
  } catch (err) {
    handleControllerError(res, 'getHistoryIncident', err);
  }
}

export async function listKnowledgeIncidents(req: Request, res: Response): Promise<void> {
  try {
    const parsed = incidentWorkspaceQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      sendError(res, 400, 'VALIDATION_ERROR', formatZodError(parsed.error));
      return;
    }
    res.json(await listKnowledgeIncidentsService(parsed.data));
  } catch (err) {
    handleControllerError(res, 'listKnowledgeIncidents', err);
  }
}

export async function getKnowledgeIncident(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIdParam(req.params.id);
    if (sendServiceError(res, id)) return;
    const result = await getKnowledgeIncidentService(id.data);
    if (sendServiceError(res, result)) return;
    res.json(result.data);
  } catch (err) {
    handleControllerError(res, 'getKnowledgeIncident', err);
  }
}

export async function listHistoryEvents(req: Request, res: Response): Promise<void> {
  try {
    const parsed = incidentWorkspaceQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      sendError(res, 400, 'VALIDATION_ERROR', formatZodError(parsed.error));
      return;
    }
    res.json(await listHistoryEventsService(parsed.data));
  } catch (err) {
    handleControllerError(res, 'listHistoryEvents', err);
  }
}

export async function listIncidentEvents(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIdParam(req.params.id);
    if (sendServiceError(res, id)) return;
    res.json(await listIncidentEventsService(id.data));
  } catch (err) {
    handleControllerError(res, 'listIncidentEvents', err);
  }
}

export async function getIncidentMetrics(req: Request, res: Response): Promise<void> {
  try {
    res.json(await getIncidentMetricsService(req.workshopUser!.userId));
  } catch (err) {
    handleControllerError(res, 'getIncidentMetrics', err);
  }
}

export async function getWorkshopAnalytics(req: Request, res: Response): Promise<void> {
  try {
    const parsed = workshopAnalyticsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      sendError(res, 400, 'VALIDATION_ERROR', formatZodError(parsed.error));
      return;
    }
    res.json(await getWorkshopAnalyticsService(parsed.data));
  } catch (err) {
    handleControllerError(res, 'getWorkshopAnalytics', err);
  }
}

export async function createIncident(req: Request, res: Response): Promise<void> {
  try {
    const parsed = createIncidentSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, 'VALIDATION_ERROR', formatZodError(parsed.error));
      return;
    }
    const result = await createIncidentService(parsed.data, req.workshopUser!.userId);
    if (sendServiceError(res, result)) return;
    res.status(201).json(result.data);
  } catch (err) {
    handleControllerError(res, 'createIncident', err);
  }
}

// Le PATCH /incidents/:id route vers la bonne fonction selon le contenu du body.
// Chaque action du cycle de vie a sa propre fonction de service dédiée.
export async function updateIncident(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIdParam(req.params.id);
    if (sendServiceError(res, id)) return;

    const parsed = updateIncidentSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, 'VALIDATION_ERROR', formatZodError(parsed.error));
      return;
    }

    const { userId, role } = req.workshopUser!;
    const updates = parsed.data;
    let result;

    if (updates.isTaken === true) {
      result = await takeIncidentService(id.data, userId, role);
    } else if (updates.status === 'PENDING') {
      result = await setPendingIncidentService(id.data, updates.diagnostic, userId, role);
    } else if (updates.status === 'OPEN' && updates.diagnostic === undefined) {
      result = await resumeIncidentService(id.data, userId, role);
    } else if (updates.status === 'CLOSED') {
      result = await closeIncidentService(id.data, updates.interventionNote, userId, role);
    } else if (updates.status === 'INVALIDATED') {
      result = await invalidateIncidentService(id.data, updates.invalidationReason, userId, role);
    } else if (updates.isPriority !== undefined) {
      result = await setPriorityIncidentService(id.data, updates.isPriority, userId, role);
    } else if (updates.responsibleComment !== undefined) {
      result = await setResponsibleCommentService(id.data, updates.responsibleComment, userId, role);
    } else if (updates.displayOrder !== undefined) {
      result = await setDisplayOrderIncidentService(id.data, updates.displayOrder, userId, role);
    } else if (updates.requestOnly === true) {
      const { requestOnly, cancelRequest, cancelRequestReason, deleteRequest, deleteRequestReason, ...editPayload } = updates;
      result = await requestEditIncidentService(id.data, editPayload as Record<string, unknown>, userId, role);
    } else if (updates.cancelRequest === true || updates.deleteRequest === true) {
      const reason = updates.cancelRequestReason ?? updates.deleteRequestReason ?? '';
      result = await requestCancelIncidentService(id.data, reason, userId, role);
    } else if (updates.applyEditRequest === true) {
      result = await approveEditIncidentService(id.data, userId, role);
    } else if (updates.rejectEditRequest === true) {
      result = await rejectEditIncidentService(id.data, userId, role);
    } else if (updates.rejectDeleteRequest === true) {
      result = await rejectCancelIncidentService(id.data, userId, role);
    } else {
      const { requestOnly, cancelRequest, cancelRequestReason, deleteRequest, deleteRequestReason, applyEditRequest, rejectEditRequest, rejectDeleteRequest, isTaken, isPriority, displayOrder, status, responsibleComment, ...editFields } = updates;
      result = await editIncidentService(id.data, editFields, userId, role);
    }

    if (sendServiceError(res, result)) return;
    res.json(result.data);
  } catch (err) {
    handleControllerError(res, 'updateIncident', err);
  }
}

export async function deleteIncident(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIdParam(req.params.id);
    if (sendServiceError(res, id)) return;
    const result = await cancelIncidentService(id.data, req.workshopUser!.userId, req.workshopUser!.role);
    if (sendServiceError(res, result)) return;
    res.json(result.data);
  } catch (err) {
    handleControllerError(res, 'deleteIncident', err);
  }
}

export async function followIncident(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIdParam(req.params.id);
    if (sendServiceError(res, id)) return;
    const result = await followIncidentService(id.data, req.workshopUser!.userId, req.workshopUser!.role);
    if (sendServiceError(res, result)) return;
    res.json(result.data);
  } catch (err) {
    handleControllerError(res, 'followIncident', err);
  }
}

export async function unfollowIncident(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIdParam(req.params.id);
    if (sendServiceError(res, id)) return;
    const result = await unfollowIncidentService(id.data, req.workshopUser!.userId, req.workshopUser!.role);
    if (sendServiceError(res, result)) return;
    res.json(result.data);
  } catch (err) {
    handleControllerError(res, 'unfollowIncident', err);
  }
}

export async function reorderIncidents(req: Request, res: Response): Promise<void> {
  try {
    const parsed = reorderIncidentsSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, 'VALIDATION_ERROR', formatZodError(parsed.error));
      return;
    }
    const result = await reorderIncidentsService(parsed.data, req.workshopUser!.userId, req.workshopUser!.role);
    if (sendServiceError(res, result)) return;
    res.json(result.data);
  } catch (err) {
    handleControllerError(res, 'reorderIncidents', err);
  }
}
