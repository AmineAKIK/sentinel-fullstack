import { Request, Response } from 'express';
import { z } from 'zod';
import { askSupport } from './support.service';
import { sendError } from '../../utils/errors';

const chatSchema = z.object({
  message: z.string().min(1).max(2000),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(4000),
      })
    )
    .max(20)
    .default([]),
});

async function handleChat(req: Request, res: Response): Promise<void> {
  const parsed = chatSchema.safeParse(req.body);
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
