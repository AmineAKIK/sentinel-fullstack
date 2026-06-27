import { Request, Response } from 'express';
import { z } from 'zod';
import { handleControllerError } from '../../utils/controller';
import { requestPasswordResetService } from './passwordReset.service';

const schema = z.object({
  badgeNumber: z.string().trim().min(1).max(40),
});

export async function requestPasswordReset(req: Request, res: Response): Promise<void> {
  try {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      // Réponse neutre — ne pas distinguer une validation échouée d'un badge inconnu.
      res.status(200).json({ sent: true });
      return;
    }

    await requestPasswordResetService(parsed.data.badgeNumber);
    res.status(200).json({ sent: true });
  } catch (err) {
    handleControllerError(res, 'requestPasswordReset', err);
  }
}
