import { Router } from 'express';
import { adminAuthMiddleware } from '../../middlewares/adminAuth';
import { getNotifPrefs, patchNotifPrefs } from './adminSettings.controller';

const router = Router();

router.get('/notifications', adminAuthMiddleware, getNotifPrefs);
router.patch('/notifications', adminAuthMiddleware, patchNotifPrefs);

export default router;
