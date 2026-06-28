import { Router } from 'express';
import { adminAuthMiddleware } from '../../middlewares/adminAuth';
import {
  getReferenceDashboard,
  getReferenceQuality,
  listReferenceAudit,
  listPendingPasswordResetRequests,
  markPasswordResetRequestHandled,
} from './admin.controller';

const router = Router();

router.use(adminAuthMiddleware);
router.get('/dashboard', getReferenceDashboard);
router.get('/quality', getReferenceQuality);
router.get('/audit', listReferenceAudit);
router.get('/password-reset-requests', listPendingPasswordResetRequests);
router.patch('/password-reset-requests/:id/handle', markPasswordResetRequestHandled);

export default router;
