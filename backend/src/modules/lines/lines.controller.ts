import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { sendError } from '../../utils/errors';
import {
  badRequest,
  checkLineAvailabilityService,
  checkLineConflictsService,
  createLineService,
  deleteLineService,
  getLineImpactService,
  getLineService,
  listLinesService,
  ServiceResult,
  updateLineService,
} from './lines.service';
import { createLineSchema, updateLineSchema } from './lines.validation';

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

export async function listLines(_req: Request, res: Response): Promise<void> {
  try {
    res.json(await listLinesService());
  } catch (err) {
    console.error('listLines error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function checkLineAvailability(req: Request, res: Response): Promise<void> {
  try {
    const lineNumber = String(req.query.lineNumber || '').trim();
    if (!lineNumber) {
      sendServiceError(res, badRequest('Numéro de ligne requis.'));
      return;
    }

    res.json(await checkLineAvailabilityService(lineNumber));
  } catch (err) {
    console.error('checkLineAvailability error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function checkLineConflicts(req: Request, res: Response): Promise<void> {
  try {
    const lineNumber = String(req.body?.lineNumber || '').trim();
    const machineIds = Array.isArray(req.body?.machineIds) ? req.body.machineIds : [];
    const lineId = req.body?.lineId ? Number(req.body.lineId) : undefined;

    if (!lineNumber) {
      sendServiceError(res, badRequest('Numéro de ligne requis.'));
      return;
    }

    res.json(await checkLineConflictsService(lineNumber, machineIds, lineId));
  } catch (err) {
    console.error('checkLineConflicts error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function createLine(req: Request, res: Response): Promise<void> {
  try {
    const parsed = createLineSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, 'VALIDATION_ERROR', formatZodError(parsed.error));
      return;
    }

    const result = await createLineService(parsed.data, req.admin!.adminId);
    if (sendServiceError(res, result)) return;

    res.status(201).json(result.data);
  } catch (err) {
    console.error('createLine error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function getLine(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Identifiant invalide.');
      return;
    }

    const result = await getLineService(id);
    if (sendServiceError(res, result)) return;

    res.json(result.data);
  } catch (err) {
    console.error('getLine error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function updateLine(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Identifiant invalide.');
      return;
    }

    const parsed = updateLineSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, 'VALIDATION_ERROR', formatZodError(parsed.error));
      return;
    }

    const updates = parsed.data;
    if (Object.keys(updates).length === 0) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Aucun champ à mettre à jour.');
      return;
    }

    const result = await updateLineService(id, updates, req.admin!.adminId);
    if (sendServiceError(res, result)) return;

    res.json(result.data);
  } catch (err) {
    console.error('updateLine error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function deleteLine(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Identifiant invalide.');
      return;
    }

    const result = await deleteLineService(id, req.admin!.adminId);
    if (sendServiceError(res, result)) return;

    res.json(result.data);
  } catch (err) {
    console.error('deleteLine error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function getLineImpact(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Identifiant invalide.');
      return;
    }

    res.json(await getLineImpactService(id));
  } catch (err) {
    console.error('getLineImpact error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}
