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

// Toutes les routes lignes exigent une session admin — y compris les
// vérifications de disponibilité, appelées uniquement depuis les formulaires
// admin (le cookie est envoyé automatiquement avec credentials: include).
router.use(adminAuthMiddleware);

router.get('/check-line', checkLineAvailability);
router.post('/check-line-conflicts', checkLineConflicts);
router.get('/', listLines);
router.post('/', createLine);
router.get('/:id', getLine);
router.get('/:id/impact', getLineImpact);
router.patch('/:id', updateLine);
router.post('/:id/archive', archiveLine);

export default router;
