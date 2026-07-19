import { z } from 'zod';
import { WORKSHOP_ROLES, FIELD_LIMITS } from '../../domain/constants';
import { numericIdentifierSchema } from '../../domain/identifiers';

export const RoleEnum = z.enum(WORKSHOP_ROLES);

export const badgeNumberSchema = numericIdentifierSchema({
  label: 'Le numéro de badge',
  min: 2,
  max: FIELD_LIMITS.BADGE,
});

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Adresse email invalide.')
  .max(254, "L'adresse email ne peut pas dépasser 254 caractères.")
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
  badgeNumber: badgeNumberSchema,
  role: RoleEnum,
  email: emailSchema,
});

export const updateAccountSchema = z.object({
  firstName: z.string().trim().min(2).max(FIELD_LIMITS.NAME).optional(),
  lastName: z.string().trim().min(2).max(FIELD_LIMITS.NAME).optional(),
  badgeNumber: badgeNumberSchema.optional(),
  role: RoleEnum.optional(),
  email: emailSchema,
});

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
