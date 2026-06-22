import { z } from 'zod';
import { FIELD_LIMITS } from '../../domain/constants';
import { MAX_PASSWORD_LENGTH } from '../../auth/bcrypt';

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
  password: z.string().max(MAX_PASSWORD_LENGTH, 'Mot de passe trop long.').optional(),
  newPassword: z.string().max(MAX_PASSWORD_LENGTH, 'Mot de passe trop long.').optional(),
  setupCode: z.string().trim().max(FIELD_LIMITS.CODE, 'Code de configuration trop long.').optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
