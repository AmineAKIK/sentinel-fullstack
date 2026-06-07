import { Router } from 'express';
import { verifyPassword, changePassword } from './adminSecurity.controller';
import { adminAuthMiddleware } from '../../middlewares/adminAuth';

const router = Router();

router.post('/verify-password', adminAuthMiddleware, verifyPassword);
router.patch('/password', adminAuthMiddleware, changePassword);

export default router;
