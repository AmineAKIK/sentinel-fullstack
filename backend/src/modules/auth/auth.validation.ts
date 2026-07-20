import { z } from 'zod';
import { FIELD_LIMITS } from '../../domain/constants';
import { isWithinBcryptByteLimit, MAX_PASSWORD_BYTES } from '../../auth/bcrypt';

const passwordInputSchema = z
  .string()
  .refine(
    isWithinBcryptByteLimit,
    `Le mot de passe ne peut pas dépasser ${MAX_PASSWORD_BYTES} octets UTF-8.`
  );

/**
 * Schéma de connexion unifiée (admin / atelier).
 * Les champs optionnels couvrent les différents flux : mot de passe admin,
 * mot de passe atelier, et première configuration de mot de passe (setupCode).
 * Toutes les chaînes sont bornées pour éviter les saisies abusives.
 */
export const loginSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, 'Identifiant requis.')
    .max(FIELD_LIMITS.IDENTIFIER, 'Identifiant trop long.'),
  password: passwordInputSchema.optional(),
  newPassword: passwordInputSchema.optional(),
  setupCode: z
    .string()
    .trim()
    .max(FIELD_LIMITS.CODE, 'Code de configuration trop long.')
    .optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
