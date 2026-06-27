import { z } from 'zod';
import { WORKSHOP_ROLES, FIELD_LIMITS } from '../../domain/constants';

export const RoleEnum = z.enum(WORKSHOP_ROLES);

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Adresse email invalide.')
  .max(254, 'L\'adresse email ne peut pas dépasser 254 caractères.')
  .optional()
  .nullable();

export const createAccountSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(2, 'Le prénom doit contenir au moins 2 caractères.')
    .max(FIELD_LIMITS.NAME, `Le prénom ne peut pas dépasser ${FIELD_LIMITS.NAME} caractères.`),
  lastName: z
    .string()
    .trim()
    .min(2, 'Le nom doit contenir au moins 2 caractères.')
    .max(FIELD_LIMITS.NAME, `Le nom ne peut pas dépasser ${FIELD_LIMITS.NAME} caractères.`),
  badgeNumber: z
    .string()
    .trim()
    .min(2, 'Le numéro de badge doit contenir au moins 2 caractères.')
    .max(FIELD_LIMITS.BADGE, `Le numéro de badge ne peut pas dépasser ${FIELD_LIMITS.BADGE} caractères.`),
  role: RoleEnum,
  email: emailSchema,
});

export const updateAccountSchema = z.object({
  firstName: z.string().trim().min(2).max(FIELD_LIMITS.NAME).optional(),
  lastName: z.string().trim().min(2).max(FIELD_LIMITS.NAME).optional(),
  badgeNumber: z.string().trim().min(2).max(FIELD_LIMITS.BADGE).optional(),
  role: RoleEnum.optional(),
  email: emailSchema,
});

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
