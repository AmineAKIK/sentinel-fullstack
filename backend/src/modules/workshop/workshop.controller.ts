import { Request, Response } from 'express';
import {
  formatZodError,
  handleControllerError,
  parseIdParam,
  sendServiceError,
} from '../../utils/controller';
import { sendError } from '../../utils/errors';
import {
  cancelIncidentService,
  createIncidentService,
  followIncidentService,
  getBoardDataService,
  getHistoryIncidentService,
  getIncidentMetricsService,
  getKnowledgeIncidentService,
  getWorkshopAnalyticsService,
  listHistoryEventsService,
  listHistoryIncidentsService,
  listIncidentEventsService,
  listIncidentsService,
  listKnowledgeIncidentsService,
  listWorkshopLinesService,
  consultArbitrationRequestService,
  unfollowIncidentService,
  updateIncidentService,
} from './workshop.service';
import {
  createIncidentSchema,
  arbitrationConsultationSchema,
  incidentWorkspaceQuerySchema,
  journalEventQuerySchema,
  updateIncidentSchema,
  workshopAnalyticsQuerySchema,
} from './workshop.validation';

export async function getBoardData(_req: Request, res: Response): Promise<void> {
  try {
    const result = await getBoardDataService();
    if (sendServiceError(res, result)) return;
    res.json(result.data);
  } catch (err) {
    handleControllerError(res, 'getBoardData', err);
  }
}

export async function listWorkshopLines(_req: Request, res: Response): Promise<void> {
  try {
    const result = await listWorkshopLinesService();
    if (sendServiceError(res, result)) return;
    res.json(result.data);
  } catch (err) {
    handleControllerError(res, 'listWorkshopLines', err);
  }
}

export async function listIncidents(req: Request, res: Response): Promise<void> {
  try {
    const result = await listIncidentsService(req.workshopUser!.userId, req.workshopUser!.role);
    if (sendServiceError(res, result)) return;
    res.json(result.data);
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
    const result = await listHistoryIncidentsService(parsed.data);
    if (sendServiceError(res, result)) return;
    res.json(result.data);
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
    const result = await listKnowledgeIncidentsService(parsed.data);
    if (sendServiceError(res, result)) return;
    res.json(result.data);
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
    const parsed = journalEventQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      sendError(res, 400, 'VALIDATION_ERROR', formatZodError(parsed.error));
      return;
    }
    const result = await listHistoryEventsService(parsed.data, req.workshopUser!.role);
    if (sendServiceError(res, result)) return;
    res.json(result.data);
  } catch (err) {
    handleControllerError(res, 'listHistoryEvents', err);
  }
}

export async function listIncidentEvents(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIdParam(req.params.id);
    if (sendServiceError(res, id)) return;
    const result = await listIncidentEventsService(id.data);
    if (sendServiceError(res, result)) return;
    res.json(result.data);
  } catch (err) {
    handleControllerError(res, 'listIncidentEvents', err);
  }
}

export async function getIncidentMetrics(req: Request, res: Response): Promise<void> {
  try {
    const result = await getIncidentMetricsService(
      req.workshopUser!.userId,
      req.workshopUser!.role
    );
    if (sendServiceError(res, result)) return;
    res.json(result.data);
  } catch (err) {
    handleControllerError(res, 'getIncidentMetrics', err);
  }
}

export async function consultArbitrationRequest(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIdParam(req.params.id);
    if (sendServiceError(res, id)) return;

    const parsed = arbitrationConsultationSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendError(res, 400, 'VALIDATION_ERROR', formatZodError(parsed.error));
      return;
    }

    const { userId, role } = req.workshopUser!;
    const result = await consultArbitrationRequestService(
      id.data,
      userId,
      role,
      parsed.data.requestType
    );
    if (sendServiceError(res, result)) return;
    res.json(result.data);
  } catch (err) {
    handleControllerError(res, 'consultArbitrationRequest', err);
  }
}

export async function getWorkshopAnalytics(req: Request, res: Response): Promise<void> {
  try {
    const parsed = workshopAnalyticsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      sendError(res, 400, 'VALIDATION_ERROR', formatZodError(parsed.error));
      return;
    }
    const result = await getWorkshopAnalyticsService(parsed.data);
    if (sendServiceError(res, result)) return;
    res.json(result.data);
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
    const result = await createIncidentService(
      parsed.data,
      req.workshopUser!.userId,
      req.workshopUser!.role
    );
    if (sendServiceError(res, result)) return;
    res.status(201).json(result.data);
  } catch (err) {
    handleControllerError(res, 'createIncident', err);
  }
}

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
    const result = await updateIncidentService(id.data, parsed.data, userId, role);
    if (sendServiceError(res, result)) return;
    res.json(result.data);
  } catch (err) {
    handleControllerError(res, 'updateIncident', err);
  }
}

export async function cancelIncident(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIdParam(req.params.id);
    if (sendServiceError(res, id)) return;
    const result = await cancelIncidentService(
      id.data,
      req.workshopUser!.userId,
      req.workshopUser!.role
    );
    if (sendServiceError(res, result)) return;
    res.json(result.data);
  } catch (err) {
    handleControllerError(res, 'cancelIncident', err);
  }
}

export async function followIncident(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIdParam(req.params.id);
    if (sendServiceError(res, id)) return;
    const result = await followIncidentService(
      id.data,
      req.workshopUser!.userId,
      req.workshopUser!.role
    );
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
    const result = await unfollowIncidentService(
      id.data,
      req.workshopUser!.userId,
      req.workshopUser!.role
    );
    if (sendServiceError(res, result)) return;
    res.json(result.data);
  } catch (err) {
    handleControllerError(res, 'unfollowIncident', err);
  }
}
