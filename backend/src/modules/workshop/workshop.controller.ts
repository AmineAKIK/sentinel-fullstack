import { Request, Response } from 'express';
import {
  formatZodError,
  handleControllerError,
  parseIdParam,
  sendServiceError,
} from '../../utils/controller';
import { sendError } from '../../utils/errors';
import {
  getBoardDataService,
  createIncidentService,
  deleteIncidentService,
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
  updateIncidentService,
} from './workshop.service';
import { createIncidentSchema, updateIncidentSchema } from './workshop.validation';

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

export async function listIncidents(_req: Request, res: Response): Promise<void> {
  try {
    res.json(await listIncidentsService());
  } catch (err) {
    handleControllerError(res, 'listIncidents', err);
  }
}

export async function listHistoryIncidents(req: Request, res: Response): Promise<void> {
  try {
    res.json(await listHistoryIncidentsService(req.query));
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
    res.json(await listKnowledgeIncidentsService(req.query));
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
    res.json(await listHistoryEventsService(req.query));
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

export async function getIncidentMetrics(_req: Request, res: Response): Promise<void> {
  try {
    res.json(await getIncidentMetricsService());
  } catch (err) {
    handleControllerError(res, 'getIncidentMetrics', err);
  }
}

export async function getWorkshopAnalytics(req: Request, res: Response): Promise<void> {
  try {
    res.json(await getWorkshopAnalyticsService(req.query));
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

export async function updateIncident(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIdParam(req.params.id);
    if (sendServiceError(res, id)) return;

    const parsed = updateIncidentSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, 'VALIDATION_ERROR', formatZodError(parsed.error));
      return;
    }

    const result = await updateIncidentService(
      id.data,
      parsed.data,
      req.workshopUser!.userId,
      req.workshopUser!.role
    );
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

    const result = await deleteIncidentService(id.data, req.workshopUser!.userId, req.workshopUser!.role);
    if (sendServiceError(res, result)) return;

    res.json(result.data);
  } catch (err) {
    handleControllerError(res, 'deleteIncident', err);
  }
}
