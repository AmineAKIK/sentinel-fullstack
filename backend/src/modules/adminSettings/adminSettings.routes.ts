import { Router } from 'express';
import { adminAuthMiddleware } from '../../middlewares/adminAuth';
import {
  getNotifPrefs,
  patchNotifPrefs,
  getBoardSettingsHandler,
  patchBoardSettingsHandler,
} from './adminSettings.controller';

const router = Router();

router.get('/notifications', adminAuthMiddleware, getNotifPrefs);
router.patch('/notifications', adminAuthMiddleware, patchNotifPrefs);
router.get('/board', adminAuthMiddleware, getBoardSettingsHandler);
router.patch('/board', adminAuthMiddleware, patchBoardSettingsHandler);

export default router;
