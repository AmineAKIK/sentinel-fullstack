import { Router } from 'express';
import { workshopAuthMiddleware } from '../../middlewares/workshopAuth';
import {
  cancelIncident,
  createIncident,
  followIncident,
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
  reorderIncidents,
  unfollowIncident,
  updateIncident,
} from './workshop.controller';

const router = Router();


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
router.post('/incidents/reorder', reorderIncidents);
router.post('/incidents/:id/cancel', cancelIncident);
router.post('/incidents/:id/follow', followIncident);
router.patch('/incidents/:id', updateIncident);
router.delete('/incidents/:id/follow', unfollowIncident);
// Legacy compatibility: cancellation is a state transition, not a deletion.
router.delete('/incidents/:id', cancelIncident);

export default router;
