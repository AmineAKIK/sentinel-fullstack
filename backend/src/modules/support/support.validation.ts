import { z } from 'zod';

const historyMessageSchema = z
  .object({
    role: z.enum(['user', 'assistant']),
    content: z.string().trim().min(1).max(4000),
  })
  .strict();

export const supportChatSchema = z
  .object({
    message: z.string().trim().min(1).max(2000),
    history: z.array(historyMessageSchema).max(20).default([]),
  })
  .strict();
