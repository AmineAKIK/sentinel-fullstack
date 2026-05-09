import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { sendError } from '../../utils/errors';
import {
  badRequest,
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
  ServiceResult,
  updateIncidentService,
} from './workshop.service';
import { createIncidentSchema, updateIncidentSchema } from './workshop.validation';

function formatZodError(err: ZodError): string {
  return err.errors.map((e) => e.message).join(' ');
}

function sendServiceError<T>(
  res: Response,
  result: ServiceResult<T>
): result is Extract<ServiceResult<T>, { ok: false }> {
  if (result.ok) return false;
  sendError(res, result.status, result.code, result.message);
  return true;
}

function requestedChangeKeys(changes: Record<string, unknown> | null | undefined): string[] {
  if (!changes) return [];
  return Object.keys(changes).filter((key) => changes[key] !== undefined);
}

export async function getBoardData(_req: Request, res: Response): Promise<void> {
  try {
    res.json(await getBoardDataService());
  } catch (err) {
    console.error('getBoardData error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function listWorkshopLines(_req: Request, res: Response): Promise<void> {
  try {
    res.json(await listWorkshopLinesService());
  } catch (err) {
    console.error('listWorkshopLines error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function listIncidents(_req: Request, res: Response): Promise<void> {
  try {
    res.json(await listIncidentsService());
  } catch (err) {
    console.error('listIncidents error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function listHistoryIncidents(req: Request, res: Response): Promise<void> {
  try {
    res.json(await listHistoryIncidentsService(req.query));
  } catch (err) {
    console.error('listHistoryIncidents error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function getHistoryIncident(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      sendServiceError(res, badRequest('Identifiant invalide.'));
      return;
    }

    const result = await getHistoryIncidentService(id);
    if (sendServiceError(res, result)) return;

    res.json(result.data);
  } catch (err) {
    console.error('getHistoryIncident error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function listKnowledgeIncidents(req: Request, res: Response): Promise<void> {
  try {
    res.json(await listKnowledgeIncidentsService(req.query));
  } catch (err) {
    console.error('listKnowledgeIncidents error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function getKnowledgeIncident(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      sendServiceError(res, badRequest('Identifiant invalide.'));
      return;
    }

    const result = await getKnowledgeIncidentService(id);
    if (sendServiceError(res, result)) return;

    res.json(result.data);
  } catch (err) {
    console.error('getKnowledgeIncident error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function listHistoryEvents(req: Request, res: Response): Promise<void> {
  try {
    res.json(await listHistoryEventsService(req.query));
  } catch (err) {
    console.error('listHistoryEvents error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function listIncidentEvents(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      sendServiceError(res, badRequest('Identifiant invalide.'));
      return;
    }

    res.json(await listIncidentEventsService(id));
  } catch (err) {
    console.error('listIncidentEvents error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function getIncidentMetrics(_req: Request, res: Response): Promise<void> {
  try {
    res.json(await getIncidentMetricsService());
  } catch (err) {
    console.error('getIncidentMetrics error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function getWorkshopAnalytics(req: Request, res: Response): Promise<void> {
  try {
    res.json(await getWorkshopAnalyticsService(req.query));
  } catch (err) {
    console.error('getWorkshopAnalytics error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
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
    console.error('createIncident error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function updateIncident(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Identifiant invalide.');
      return;
    }

    const parsed = updateIncidentSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, 'VALIDATION_ERROR', formatZodError(parsed.error));
      return;
    }

    const result = await updateIncidentService(
      id,
      parsed.data,
      req.workshopUser!.userId,
      req.workshopUser!.role
    );
    if (sendServiceError(res, result)) return;

    res.json(result.data);
  } catch (err) {
    console.error('updateIncident error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function deleteIncident(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Identifiant invalide.');
      return;
    }

    const result = await deleteIncidentService(id, req.workshopUser!.userId, req.workshopUser!.role);
    if (sendServiceError(res, result)) return;

    res.json(result.data);
  } catch (err) {
    console.error('deleteIncident error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}
