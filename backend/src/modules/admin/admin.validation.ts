import { z } from 'zod';

const optionalAuditDateSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z
    .string({ invalid_type_error: 'Date invalide (format ISO 8601 attendu).' })
    .trim()
    .datetime({
      offset: true,
      message: 'Date invalide (format ISO 8601 attendu).',
    })
    .optional()
);

export const referenceAuditQuerySchema = z
  .object({
    scope: z.unknown().optional(),
    taskGroup: z.unknown().optional(),
    q: z.unknown().optional(),
    start: optionalAuditDateSchema,
    end: optionalAuditDateSchema,
    order: z.unknown().optional(),
    limit: z.unknown().optional(),
  })
  .refine(
    (query) => !query.start || !query.end || Date.parse(query.start) <= Date.parse(query.end),
    {
      message: 'La date de début doit être antérieure ou égale à la date de fin.',
      path: ['start'],
    }
  );
