import { Router } from 'express';
import { createRateLimit } from '../../middlewares/loginRateLimit';
import { requestPasswordReset } from './passwordReset.controller';

const router = Router();

// Rate limit dédié : 5 requêtes / 15 min par IP — route publique sensible
const resetLimiter = createRateLimit({
  windowMs: 15 * 60 * 1000,
  maxAttempts: 5,
  ipOnly: true,
});

router.post('/request', resetLimiter.consume, requestPasswordReset);

export default router;
