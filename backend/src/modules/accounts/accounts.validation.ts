import { z } from 'zod';
import { WORKSHOP_ROLES } from '../../domain/constants';

export const RoleEnum = z.enum(WORKSHOP_ROLES);

export const createAccountSchema = z.object({
  firstName: z.string().trim().min(2, 'Le prénom doit contenir au moins 2 caractères.'),
  lastName: z.string().trim().min(2, 'Le nom doit contenir au moins 2 caractères.'),
  badgeNumber: z
    .string()
    .trim()
    .min(2, 'Le numéro de badge doit contenir au moins 2 caractères.')
    .max(40, 'Le numéro de badge ne peut pas dépasser 40 caractères.'),
  role: RoleEnum,
});

export const updateAccountSchema = z.object({
  firstName: z.string().trim().min(2).optional(),
  lastName: z.string().trim().min(2).optional(),
  badgeNumber: z.string().trim().min(2).max(40).optional(),
  role: RoleEnum.optional(),
});

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
