import { Router } from 'express';
import {
  listAccounts,
  checkBadgeAvailability,
  createAccount,
  getAccount,
  updateAccount,
  activateAccount,
  deactivateAccount,
  deleteAccount,
  resetAccountPassword,
  getAccountImpact,
} from './accounts.controller';
import { adminAuthMiddleware } from '../../middlewares/adminAuth';

const router = Router();

router.use(adminAuthMiddleware);

router.get('/', listAccounts);
router.get('/check-badge', checkBadgeAvailability);
router.post('/', createAccount);
router.get('/:id', getAccount);
router.get('/:id/impact', getAccountImpact);
router.patch('/:id', updateAccount);
router.patch('/:id/activate', activateAccount);
router.patch('/:id/deactivate', deactivateAccount);
router.patch('/:id/reset-password', resetAccountPassword);
router.delete('/:id', deleteAccount);

export default router;
