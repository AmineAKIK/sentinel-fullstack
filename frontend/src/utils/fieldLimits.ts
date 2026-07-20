/**
 * Longueurs maximales des champs texte, alignées sur les limites de validation
 * du backend (backend/src/domain/constants.ts → FIELD_LIMITS). Utilisées pour
 * les attributs maxLength et les compteurs de caractères côté UI.
 */
export const FIELD_LIMITS = {
  NAME: 80,
  BADGE: 40,
  IDENTIFIER: 80,
  MACHINE_ID: 50,
  BRAND: 100,
  ROBOT: 50,
  LINE_NUMBER: 40,
  PRODUCT: 120,
  CODE: 100,
  // Attribut maxLength (caractères) complété par la borne bcrypt UTF-8 de 72 octets.
  PASSWORD: 72,
  COMMENT: 500,
  NOTE: 1000,
  SEARCH: 120,
} as const;
