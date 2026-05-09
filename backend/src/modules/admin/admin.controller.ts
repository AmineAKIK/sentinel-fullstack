import { Request, Response } from 'express';
import { sendError } from '../../utils/errors';
import {
  getReferenceDashboardService,
  getReferenceQualityService,
  listReferenceAuditService,
} from './admin.service';

export async function getReferenceDashboard(_req: Request, res: Response): Promise<void> {
  try {
    res.json(await getReferenceDashboardService());
  } catch (err) {
    console.error('getReferenceDashboard error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function getReferenceQuality(_req: Request, res: Response): Promise<void> {
  try {
    res.json(await getReferenceQualityService());
  } catch (err) {
    console.error('getReferenceQuality error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function listReferenceAudit(req: Request, res: Response): Promise<void> {
  try {
    res.json(await listReferenceAuditService(req.query));
  } catch (err) {
    console.error('listReferenceAudit error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}
