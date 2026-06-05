import { z } from 'zod';
import { INCIDENT_SHIFTS, INCIDENT_STATES, INCIDENT_STATUSES } from '../../domain/constants';

export const ShiftEnum = z.enum(INCIDENT_SHIFTS);
export const IncidentStateEnum = z.enum(INCIDENT_STATES);
export const IncidentStatusEnum = z.enum(INCIDENT_STATUSES);

export const createIncidentSchema = z.object({
  shift: ShiftEnum,
  lineId: z.coerce.number().int().positive(),
  machineId: z.string().trim().min(1),
  robotLabel: z.string().trim().min(1),
  headNumber: z.coerce.number().int().min(1, 'La tête doit correspondre au référentiel de la machine.'),
  state: IncidentStateEnum,
  comment: z.string().trim().max(1000).optional(),
  currentProduct: z.string().trim().max(120).optional(),
});

export const updateIncidentSchema = createIncidentSchema.partial().extend({
  isTaken: z.boolean().optional(),
  isPriority: z.boolean().optional(),
  displayOrder: z.coerce.number().int().optional(),
  status: IncidentStatusEnum.optional(),
  diagnostic: z.string().trim().max(1000).optional(),
  interventionNote: z.string().trim().max(1000).optional(),
  responsibleComment: z.string().trim().max(500).optional(),
  requestOnly: z.boolean().optional(),
  cancelRequest: z.boolean().optional(),
  cancelRequestReason: z.string().trim().max(500).optional(),
  deleteRequest: z.boolean().optional(),
  deleteRequestReason: z.string().trim().max(500).optional(),
  invalidationReason: z.string().trim().max(500).optional(),
  applyEditRequest: z.boolean().optional(),
  rejectEditRequest: z.boolean().optional(),
  rejectDeleteRequest: z.boolean().optional(),
});

export const incidentWorkspaceQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: IncidentStatusEnum.optional(),
  state: IncidentStateEnum.optional(),
  lineId: z.coerce.number().int().positive().optional(),
  machineId: z.string().trim().max(120).optional(),
  eventType: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

const isoDateTimeSchema = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: 'Date invalide (format ISO 8601 attendu).' });

export const workshopAnalyticsQuerySchema = z.object({
  start: isoDateTimeSchema.optional(),
  end: isoDateTimeSchema.optional(),
  lineId: z.coerce.number().int().positive().optional(),
  machineId: z.string().trim().max(120).optional(),
});

export const reorderIncidentsSchema = z.object({
  orderedIncidentIds: z.array(z.coerce.number().int().positive()).min(1).max(500),
});

export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;
export type UpdateIncidentInput = z.infer<typeof updateIncidentSchema>;
export type ReorderIncidentsInput = z.infer<typeof reorderIncidentsSchema>;
