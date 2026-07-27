import { z } from 'zod';
import {
  INCIDENT_STATES,
  INCIDENT_STATUSES,
  INCIDENT_LIST_MAX_LIMIT,
  FIELD_LIMITS,
  ANALYTICS_MAX_WINDOW_DAYS,
} from '../../domain/constants';

export const IncidentStateEnum = z.enum(INCIDENT_STATES);
export const IncidentStatusEnum = z.enum(INCIDENT_STATUSES);

export const createIncidentSchema = z.object({
  lineId: z.coerce.number().int().positive(),
  machineId: z.string().trim().min(1).max(FIELD_LIMITS.MACHINE_ID),
  robotLabel: z.string().trim().min(1).max(FIELD_LIMITS.ROBOT),
  headNumber: z.coerce
    .number()
    .int()
    .min(1, 'La tête doit correspondre au référentiel de la machine.'),
  state: IncidentStateEnum,
  comment: z.string().trim().max(FIELD_LIMITS.COMMENT).optional(),
  currentProduct: z
    .string()
    .trim()
    .min(1, 'Le produit en cours est obligatoire.')
    .max(FIELD_LIMITS.PRODUCT),
});

export const updateIncidentSchema = createIncidentSchema.partial().extend({
  isTaken: z.boolean().optional(),
  isPriority: z.boolean().optional(),
  status: IncidentStatusEnum.optional(),
  diagnostic: z.string().trim().max(FIELD_LIMITS.NOTE).optional(),
  interventionNote: z.string().trim().max(FIELD_LIMITS.NOTE).optional(),
  responsibleComment: z.string().trim().max(FIELD_LIMITS.COMMENT).optional(),
  requestOnly: z.boolean().optional(),
  cancelRequest: z.boolean().optional(),
  cancelRequestReason: z.string().trim().max(FIELD_LIMITS.COMMENT).optional(),
  deleteRequest: z.boolean().optional(),
  deleteRequestReason: z.string().trim().max(FIELD_LIMITS.COMMENT).optional(),
  invalidationReason: z.string().trim().max(FIELD_LIMITS.COMMENT).optional(),
  applyEditRequest: z.boolean().optional(),
  rejectEditRequest: z.boolean().optional(),
  rejectDeleteRequest: z.boolean().optional(),
  withdrawEditRequest: z.boolean().optional(),
  withdrawCancelRequest: z.boolean().optional(),
  // Motif de décision obligatoire lors d'un refus de correction ou d'annulation
  // (RC3, lots 4 et 5).
  decisionReason: z.string().trim().max(FIELD_LIMITS.COMMENT).optional(),
});

export const incidentWorkspaceQuerySchema = z.object({
  q: z.string().trim().max(FIELD_LIMITS.SEARCH).optional(),
  status: IncidentStatusEnum.optional(),
  state: IncidentStateEnum.optional(),
  lineId: z.coerce.number().int().positive().optional(),
  machineId: z.string().trim().max(FIELD_LIMITS.SEARCH).optional(),
  eventType: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(INCIDENT_LIST_MAX_LIMIT).optional(),
  cursor: z.string().trim().max(200).optional(),
});

const isoDateTimeSchema = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(Date.parse(v)), {
    message: 'Date invalide (format ISO 8601 attendu).',
  });

// Contrainte de fenêtre partagée (start <= end, span <= ANALYTICS_MAX_WINDOW_DAYS)
// entre le Pilotage (DR-10) et le filtre période du Journal (ANA-03) : même
// définition de « journée métier » bornée, pour ne pas diverger entre écrans.
function withBoundedWindow<Shape extends { start?: string; end?: string }>(
  schema: z.ZodType<Shape>
) {
  return schema
    .refine(
      (value) => !value.start || !value.end || Date.parse(value.start) <= Date.parse(value.end),
      {
        message: 'La date de début doit être antérieure ou égale à la date de fin.',
        path: ['start'],
      }
    )
    .refine(
      (value) => {
        if (!value.start || !value.end) return true;
        const spanMs = Date.parse(value.end) - Date.parse(value.start);
        return spanMs <= ANALYTICS_MAX_WINDOW_DAYS * 24 * 60 * 60 * 1000;
      },
      {
        message: `La fenêtre analysée ne peut pas dépasser ${ANALYTICS_MAX_WINDOW_DAYS} jours.`,
        path: ['end'],
      }
    );
}

export const workshopAnalyticsQuerySchema = withBoundedWindow(
  z.object({
    start: isoDateTimeSchema.optional(),
    end: isoDateTimeSchema.optional(),
    lineId: z.coerce.number().int().positive().optional(),
    machineId: z.string().trim().max(120).optional(),
  })
);

export const journalEventQuerySchema = withBoundedWindow(
  incidentWorkspaceQuerySchema.extend({
    start: isoDateTimeSchema.optional(),
    end: isoDateTimeSchema.optional(),
  })
);

export const arbitrationConsultationSchema = z.object({
  requestType: z.enum(['EDIT', 'CANCEL']),
});

export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;
export type UpdateIncidentInput = z.infer<typeof updateIncidentSchema>;
export type ArbitrationConsultationInput = z.infer<typeof arbitrationConsultationSchema>;
