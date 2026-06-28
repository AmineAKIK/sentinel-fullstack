import { Request, Response } from 'express';
import { handleControllerError } from '../../utils/controller';
import {
  getReferenceDashboardService,
  getReferenceQualityService,
  listReferenceAuditService,
  listPendingPasswordResetRequestsService,
  markPasswordResetRequestHandledService,
} from './admin.service';

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
    res.json(await listReferenceAuditService(req.query));
  } catch (err) {
    handleControllerError(res, 'listReferenceAudit', err);
  }
}

export async function listPendingPasswordResetRequests(_req: Request, res: Response): Promise<void> {
  try {
    res.json(await listPendingPasswordResetRequestsService());
  } catch (err) {
    handleControllerError(res, 'listPendingPasswordResetRequests', err);
  }
}

export async function markPasswordResetRequestHandled(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: { code: 'INVALID_ID', message: 'ID invalide.' } }); return; }
    const ok = await markPasswordResetRequestHandledService(id);
    if (!ok) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Demande introuvable ou déjà traitée.' } }); return; }
    res.json({ ok: true });
  } catch (err) {
    handleControllerError(res, 'markPasswordResetRequestHandled', err);
  }
}
