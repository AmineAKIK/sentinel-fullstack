import { Request, Response } from 'express';
import {
  formatZodError,
  handleControllerError,
  parseIdParam,
  sendServiceError,
} from '../../utils/controller';
import { sendError } from '../../utils/errors';
import {
  getReferenceDashboardService,
  getReferenceQualityService,
  listReferenceAuditService,
  listPendingPasswordResetRequestsService,
  markPasswordResetRequestHandledService,
} from './admin.service';
import { sendUnauthenticated } from '../../auth/authResponses';
import { referenceAuditQuerySchema } from './admin.validation';

export async function getReferenceDashboard(_req: Request, res: Response): Promise<void> {
  try {
    res.json(await getReferenceDashboardService());
  } catch (err) {
    handleControllerError(res, 'getReferenceDashboard', err);
  }
}

export async function getReferenceQuality(_req: Request, res: Response): Promise<void> {
  try {
    res.json(await getReferenceQualityService());
  } catch (err) {
    handleControllerError(res, 'getReferenceQuality', err);
  }
}

export async function listReferenceAudit(req: Request, res: Response): Promise<void> {
  try {
    const parsed = referenceAuditQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      sendError(res, 400, 'VALIDATION_ERROR', formatZodError(parsed.error));
      return;
    }
    res.json(await listReferenceAuditService(parsed.data));
  } catch (err) {
    handleControllerError(res, 'listReferenceAudit', err);
  }
}

export async function listPendingPasswordResetRequests(
  _req: Request,
  res: Response
): Promise<void> {
  try {
    res.json(await listPendingPasswordResetRequestsService());
  } catch (err) {
    handleControllerError(res, 'listPendingPasswordResetRequests', err);
  }
}

export async function markPasswordResetRequestHandled(req: Request, res: Response): Promise<void> {
  try {
    if (!req.admin) {
      sendUnauthenticated(res);
      return;
    }
    const id = parseIdParam(req.params.id);
    if (sendServiceError(res, id)) return;

    const result = await markPasswordResetRequestHandledService(id.data, req.admin.adminId);
    if (sendServiceError(res, result)) return;

    res.json(result.data);
  } catch (err) {
    handleControllerError(res, 'markPasswordResetRequestHandled', err);
  }
}
