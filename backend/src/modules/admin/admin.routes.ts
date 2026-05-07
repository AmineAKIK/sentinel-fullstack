import { Router } from 'express';
import { adminAuthMiddleware } from '../../middlewares/adminAuth';
import { getReferenceDashboard, getReferenceQuality, listReferenceAudit } from './admin.controller';

const router = Router();

router.use(adminAuthMiddleware);
router.get('/dashboard', getReferenceDashboard);
router.get('/quality', getReferenceQuality);
router.get('/audit', listReferenceAudit);

export default router;
