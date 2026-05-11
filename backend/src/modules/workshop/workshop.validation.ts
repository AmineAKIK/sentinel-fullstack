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
  deleteRequest: z.boolean().optional(),
  deleteRequestReason: z.string().trim().max(500).optional(),
  invalidationReason: z.string().trim().max(500).optional(),
  applyEditRequest: z.boolean().optional(),
  rejectEditRequest: z.boolean().optional(),
  rejectDeleteRequest: z.boolean().optional(),
});

export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;
export type UpdateIncidentInput = z.infer<typeof updateIncidentSchema>;
