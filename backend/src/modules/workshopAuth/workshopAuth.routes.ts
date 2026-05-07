import { Router } from 'express';
import { workshopAuthMiddleware } from '../../middlewares/workshopAuth';
import { login, logout, me } from './workshopAuth.controller';

const router = Router();

router.post('/login', login);
router.post('/logout', logout);
router.get('/me', workshopAuthMiddleware, me);

export default router;
