import { Router } from 'express';
import { adminAuthMiddleware } from '../../middlewares/adminAuth';
import { workshopAuthMiddleware } from '../../middlewares/workshopAuth';
import { chatAdmin, chatWorkshop } from './support.controller';
import { createRateLimit } from '../../middlewares/loginRateLimit';

const supportLimiter = createRateLimit({
  windowMs: 5 * 60 * 1000,
  maxAttempts: 20,
  keyGenerator: (req) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    if (req.admin) return `admin:${req.admin.adminId}:${ip}`;
    if (req.workshopUser) return `workshop:${req.workshopUser.userId}:${ip}`;
    return `anonymous:${ip}`;
  },
});

const adminRouter = Router();
const workshopRouter = Router();

adminRouter.use(adminAuthMiddleware);
adminRouter.use(supportLimiter.consume);
adminRouter.post('/chat', chatAdmin);

workshopRouter.use(workshopAuthMiddleware);
workshopRouter.use(supportLimiter.consume);
workshopRouter.post('/chat', chatWorkshop);

export { adminRouter, workshopRouter };
