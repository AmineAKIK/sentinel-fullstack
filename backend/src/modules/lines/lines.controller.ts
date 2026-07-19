import { Request, Response } from 'express';
import {
  formatZodError,
  handleControllerError,
  parseIdParam,
  sendServiceError,
} from '../../utils/controller';
import { sendError } from '../../utils/errors';
import { badRequest } from '../../utils/serviceResult';
import {
  archiveLineService,
  checkLineAvailabilityService,
  checkLineConflictsService,
  createLineService,
  getLineImpactService,
  getLineService,
  listLinesService,
  updateLineService,
} from './lines.service';
import { createLineSchema, lineNumberSchema, updateLineSchema } from './lines.validation';

export async function listLines(_req: Request, res: Response): Promise<void> {
  try {
    res.json(await listLinesService());
  } catch (err) {
    handleControllerError(res, 'listLines', err);
  }
}

export async function checkLineAvailability(req: Request, res: Response): Promise<void> {
  try {
    const parsed = lineNumberSchema.safeParse(req.query.lineNumber);
    if (!parsed.success) {
      sendServiceError(res, badRequest(formatZodError(parsed.error)));
      return;
    }

    res.json(await checkLineAvailabilityService(parsed.data));
  } catch (err) {
    handleControllerError(res, 'checkLineAvailability', err);
  }
}

export async function checkLineConflicts(req: Request, res: Response): Promise<void> {
  try {
    const parsedLineNumber = lineNumberSchema.safeParse(req.body?.lineNumber);
    const machineIds = Array.isArray(req.body?.machineIds) ? req.body.machineIds : [];
    const lineId = req.body?.lineId ? Number(req.body.lineId) : undefined;

    if (!parsedLineNumber.success) {
      sendServiceError(res, badRequest(formatZodError(parsedLineNumber.error)));
      return;
    }

    res.json(await checkLineConflictsService(parsedLineNumber.data, machineIds, lineId));
  } catch (err) {
    handleControllerError(res, 'checkLineConflicts', err);
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
    handleControllerError(res, 'createLine', err);
  }
}

export async function getLine(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIdParam(req.params.id);
    if (sendServiceError(res, id)) return;

    const result = await getLineService(id.data);
    if (sendServiceError(res, result)) return;

    res.json(result.data);
  } catch (err) {
    handleControllerError(res, 'getLine', err);
  }
}

export async function updateLine(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIdParam(req.params.id);
    if (sendServiceError(res, id)) return;

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

    const result = await updateLineService(id.data, updates, req.admin!.adminId);
    if (sendServiceError(res, result)) return;

    res.json(result.data);
  } catch (err) {
    handleControllerError(res, 'updateLine', err);
  }
}

export async function archiveLine(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIdParam(req.params.id);
    if (sendServiceError(res, id)) return;

    const force = req.body?.force === true;
    const result = await archiveLineService(id.data, req.admin!.adminId, force);
    if (sendServiceError(res, result)) return;

    res.json(result.data);
  } catch (err) {
    handleControllerError(res, 'archiveLine', err);
  }
}

export async function getLineImpact(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIdParam(req.params.id);
    if (sendServiceError(res, id)) return;

    res.json(await getLineImpactService(id.data));
  } catch (err) {
    handleControllerError(res, 'getLineImpact', err);
  }
}
