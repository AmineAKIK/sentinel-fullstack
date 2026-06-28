import { Router } from 'express';
import { verifyPassword, changePassword, getEmail, updateEmail } from './adminSecurity.controller';
import { adminAuthMiddleware } from '../../middlewares/adminAuth';

const router = Router();

router.post('/verify-password', adminAuthMiddleware, verifyPassword);
router.patch('/password', adminAuthMiddleware, changePassword);
router.get('/email', adminAuthMiddleware, getEmail);
router.patch('/email', adminAuthMiddleware, updateEmail);

export default router;
