import { Router } from 'express';
import { adminAuthMiddleware } from '../../middlewares/adminAuth';
import {
	archiveLine,
	createLine,
	getLine,
	listLines,
	updateLine,
	checkLineAvailability,
	checkLineConflicts,
	getLineImpact,
} from './lines.controller';

const router = Router();

// Routes de validation sans authentification (appelées depuis les formulaires de création/édition)
router.get('/check-line', checkLineAvailability);
router.post('/check-line-conflicts', checkLineConflicts);

// Routes CRUD protégées
router.use(adminAuthMiddleware);
router.get('/', listLines);
router.post('/', createLine);
router.get('/:id', getLine);
router.get('/:id/impact', getLineImpact);
router.patch('/:id', updateLine);
router.post('/:id/archive', archiveLine);

export default router;
