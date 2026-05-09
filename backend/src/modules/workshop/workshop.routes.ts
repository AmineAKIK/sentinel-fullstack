import { Router } from 'express';
import { workshopAuthMiddleware } from '../../middlewares/workshopAuth';
import {
	createIncident,
	deleteIncident,
	getBoardData,
	getHistoryIncident,
	getIncidentMetrics,
	getKnowledgeIncident,
	getWorkshopAnalytics,
	listIncidentEvents,
	listHistoryEvents,
	listHistoryIncidents,
	listIncidents,
	listKnowledgeIncidents,
	listWorkshopLines,
	updateIncident,
} from './workshop.controller';

const router = Router();

router.get('/board', getBoardData);

router.use(workshopAuthMiddleware);
router.get('/lines', listWorkshopLines);
router.get('/incidents', listIncidents);
router.get('/history/incidents', listHistoryIncidents);
router.get('/history/incidents/:id', getHistoryIncident);
router.get('/history/events', listHistoryEvents);
router.get('/knowledge/incidents', listKnowledgeIncidents);
router.get('/knowledge/incidents/:id', getKnowledgeIncident);
router.get('/incidents/:id/events', listIncidentEvents);
router.get('/metrics', getIncidentMetrics);
router.get('/analytics', getWorkshopAnalytics);
router.post('/incidents', createIncident);
router.patch('/incidents/:id', updateIncident);
router.delete('/incidents/:id', deleteIncident);

export default router;
