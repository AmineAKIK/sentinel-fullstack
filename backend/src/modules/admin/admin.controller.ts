import { Request, Response } from 'express';
import { handleControllerError } from '../../utils/controller';
import {
  getReferenceDashboardService,
  getReferenceQualityService,
  listReferenceAuditService,
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
