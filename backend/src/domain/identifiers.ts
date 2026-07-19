import { z } from 'zod';
import { FIELD_LIMITS } from './constants';

export const DIGITS_ONLY_PATTERN = /^[0-9]+$/;

interface NumericIdentifierOptions {
  label: string;
  min: number;
  max: number;
}

export function numericIdentifierSchema({ label, min, max }: NumericIdentifierOptions) {
  return z
    .string()
    .trim()
    .min(
      min,
      min === 1 ? `${label} est obligatoire.` : `${label} doit contenir au moins ${min} caractères.`
    )
    .max(max, `${label} ne peut pas dépasser ${max} caractères.`)
    .regex(DIGITS_ONLY_PATTERN, `${label} doit contenir uniquement des chiffres.`);
}

export function isWorkshopIdentifier(value: string): boolean {
  return DIGITS_ONLY_PATTERN.test(value);
}

export function normalizeAdminUsername(value: string): string {
  const username = value.trim();
  if (!username) throw new Error("L'identifiant administrateur est requis.");
  if (DIGITS_ONLY_PATTERN.test(username)) {
    throw new Error("L'identifiant administrateur ne peut pas être uniquement numérique.");
  }
  if (username.length > FIELD_LIMITS.IDENTIFIER) {
    throw new Error(
      `L'identifiant administrateur ne peut pas dépasser ${FIELD_LIMITS.IDENTIFIER} caractères.`
    );
  }
  return username;
}
