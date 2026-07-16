import { z } from 'zod';
import {
  INCIDENT_STATES,
  INCIDENT_STATUSES,
  INCIDENT_LIST_MAX_LIMIT,
  FIELD_LIMITS,
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
});

export const incidentWorkspaceQuerySchema = z.object({
  q: z.string().trim().max(FIELD_LIMITS.SEARCH).optional(),
  status: IncidentStatusEnum.optional(),
  state: IncidentStateEnum.optional(),
  lineId: z.coerce.number().int().positive().optional(),
  machineId: z.string().trim().max(FIELD_LIMITS.SEARCH).optional(),
  eventType: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(INCIDENT_LIST_MAX_LIMIT).optional(),
});

const isoDateTimeSchema = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(Date.parse(v)), {
    message: 'Date invalide (format ISO 8601 attendu).',
  });

export const workshopAnalyticsQuerySchema = z.object({
  start: isoDateTimeSchema.optional(),
  end: isoDateTimeSchema.optional(),
  lineId: z.coerce.number().int().positive().optional(),
  machineId: z.string().trim().max(120).optional(),
});

export const arbitrationConsultationSchema = z.object({
  requestType: z.enum(['EDIT', 'CANCEL']),
});

export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;
export type UpdateIncidentInput = z.infer<typeof updateIncidentSchema>;
export type ArbitrationConsultationInput = z.infer<typeof arbitrationConsultationSchema>;
