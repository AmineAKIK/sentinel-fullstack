import { Router } from 'express';
import { workshopAuthMiddleware } from '../../middlewares/workshopAuth';
import {
	createIncident,
	deleteIncident,
	getIncidentMetrics,
	getWorkshopAnalytics,
	listIncidentEvents,
	listIncidents,
	listWorkshopLines,
	updateIncident,
} from './workshop.controller';

const router = Router();

router.get('/lines', listWorkshopLines);
router.get('/incidents', listIncidents);
router.get('/incidents/:id/events', listIncidentEvents);
router.get('/metrics', getIncidentMetrics);
router.get('/analytics', getWorkshopAnalytics);
router.use(workshopAuthMiddleware);
router.post('/incidents', createIncident);
router.patch('/incidents/:id', updateIncident);
router.delete('/incidents/:id', deleteIncident);

export default router;
