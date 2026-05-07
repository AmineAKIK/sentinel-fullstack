import { Router } from 'express';
import { login, me, logout, verifyPassword } from './adminAuth.controller';
import { adminAuthMiddleware } from '../../middlewares/adminAuth';

const router = Router();

router.post('/login', login);
router.get('/me', adminAuthMiddleware, me);
router.post('/logout', logout);
router.post('/verify-password', adminAuthMiddleware, verifyPassword);

export default router;
