import { Request, Response } from 'express';
import { askSupport } from './support.service';
import { sendError } from '../../utils/errors';
import { supportChatSchema } from './support.validation';

async function handleChat(req: Request, res: Response): Promise<void> {
  const parsed = supportChatSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Corps de requête invalide.');
    return;
  }

  try {
    const result = await askSupport(parsed.data.history, parsed.data.message);
    res.json(result);
  } catch {
    sendError(
      res,
      503,
      'SERVICE_UNAVAILABLE',
      "Le service d'assistance est temporairement indisponible."
    );
  }
}

export function chatAdmin(req: Request, res: Response): void {
  void handleChat(req, res);
}

export function chatWorkshop(req: Request, res: Response): void {
  void handleChat(req, res);
}
