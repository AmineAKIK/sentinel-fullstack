import { Router } from 'express';
import { adminAuthMiddleware } from '../../middlewares/adminAuth';
import {
  getNotifPrefs,
  patchNotifPrefs,
  getBoardSettingsHandler,
  patchBoardToggle,
  patchBoardCode,
} from './adminSettings.controller';

const router = Router();

router.get('/notifications', adminAuthMiddleware, getNotifPrefs);
router.patch('/notifications', adminAuthMiddleware, patchNotifPrefs);
router.get('/board', adminAuthMiddleware, getBoardSettingsHandler);
router.patch('/board/toggle', adminAuthMiddleware, patchBoardToggle);
router.patch('/board/code', adminAuthMiddleware, patchBoardCode);

export default router;
