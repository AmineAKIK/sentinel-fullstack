import { Router } from 'express';
import { adminAuthMiddleware } from '../../middlewares/adminAuth';
import { workshopAuthMiddleware } from '../../middlewares/workshopAuth';
import { chatAdmin, chatWorkshop } from './support.controller';

const adminRouter = Router();
const workshopRouter = Router();

adminRouter.use(adminAuthMiddleware);
adminRouter.post('/chat', chatAdmin);

workshopRouter.use(workshopAuthMiddleware);
workshopRouter.post('/chat', chatWorkshop);

export { adminRouter, workshopRouter };
