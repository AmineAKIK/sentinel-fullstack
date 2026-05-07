import { Router } from 'express';
import { adminAuthMiddleware } from '../../middlewares/adminAuth';
import {
	createLine,
	deleteLine,
	getLine,
	listLines,
	updateLine,
	checkLineAvailability,
	checkLineConflicts,
	getLineImpact,
} from './lines.controller';

const router = Router();

router.use(adminAuthMiddleware);

router.get('/', listLines);
router.get('/check-line', checkLineAvailability);
router.post('/check-line-conflicts', checkLineConflicts);
router.post('/', createLine);
router.get('/:id', getLine);
router.get('/:id/impact', getLineImpact);
router.patch('/:id', updateLine);
router.delete('/:id', deleteLine);

export default router;
