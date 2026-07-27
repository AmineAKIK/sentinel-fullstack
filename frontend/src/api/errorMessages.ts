import { ApiResponseError, type ApiErrorDetails } from './client';

/**
 * Traduction de présentation (lot 2 RC3). Convertit une erreur API structurée
 * (`code` + `details`) en un libellé français compréhensible. Le backend ne
 * fabrique plus de texte exposant un nom de champ ; c'est ici qu'on reconstruit
 * un message métier.
 *
 * Règles strictes :
 * - on n'affiche JAMAIS `error.message` brut, ni `details.field`, ni
 *   `details.reason`, ni une clé snake_case, ni un nom SQL, ni une valeur
 *   sensible ;
 * - tout code, champ ou raison inconnu retombe sur un message générique sûr ;
 * - `min`/`max` ne sont montrés que lorsqu'ils sont fournis et utiles.
 */

export const GENERIC_ERROR_MESSAGE = 'Une erreur est survenue. Veuillez réessayer.';

// Libellés français des champs publics. Aucun nom interne n'apparaît ici.
const FIELD_LABELS: Record<string, string> = {
  boardSessionDuration: 'La durée de session Board',
  adminSessionDuration: 'La durée de session administrateur',
  workshopSessionDuration: 'La durée de session atelier',
  loginMaxAttempts: 'Le nombre maximal de tentatives de connexion',
  setupCodeDuration: 'La durée de validité du code de configuration',
  boardLabel: 'Le libellé du Board',
  decisionReason: 'Le motif du refus',
};

// Codes métier globaux (indépendants d'un champ) → message français.
const CODE_MESSAGES: Record<string, string> = {
  NETWORK_ERROR: 'Connexion impossible. Vérifiez votre réseau puis réessayez.',
  REQUEST_TIMEOUT: 'Le délai de la requête a expiré. Veuillez réessayer.',
  NO_CHANGES: 'Aucune modification à enregistrer.',
  ARBITRATION_ALREADY_PENDING: 'Une demande d’arbitrage est déjà en attente sur cet incident.',
  ARBITRATION_REQUIRED: 'Une demande d’arbitrage doit être décidée avant cette action.',
  SESSION_REVOKED: 'Votre session a été révoquée. Veuillez vous reconnecter.',
  UNAUTHORIZED: 'Votre session a expiré. Veuillez vous reconnecter.',
  WORKSHOP_ACCOUNT_DISABLED: 'Votre accès atelier a été suspendu. Contactez votre responsable.',
  REAUTHENTICATION_FAILED: 'Mot de passe incorrect.',
  FORBIDDEN: 'Vous n’avez pas les droits pour effectuer cette action.',
  NOT_FOUND: 'L’élément demandé est introuvable.',
  CONFLICT: 'Cette action entre en conflit avec l’état actuel. Rechargez puis réessayez.',
  RATE_LIMITED: 'Trop de tentatives. Veuillez patienter avant de réessayer.',
  SERVICE_UNAVAILABLE: 'Le service est momentanément indisponible. Réessayez plus tard.',
  BADGE_ALREADY_EXISTS: 'Ce badge est déjà utilisé.',
  LINE_ALREADY_EXISTS: 'Cette ligne existe déjà.',
  MACHINE_ALREADY_EXISTS: 'Cette machine existe déjà.',
};

function describeValidation(details: ApiErrorDetails | undefined): string | null {
  if (!details) return null;
  const label = details.field ? FIELD_LABELS[details.field] : undefined;
  switch (details.reason) {
    case 'OUT_OF_RANGE': {
      if (label && typeof details.min === 'number' && typeof details.max === 'number') {
        return `${label} doit être comprise entre ${details.min} et ${details.max}.`;
      }
      if (label) return `${label} est hors des valeurs autorisées.`;
      return null;
    }
    case 'REQUIRED':
      return label ? `${label} est obligatoire.` : null;
    case 'TOO_LONG':
      return label && typeof details.max === 'number'
        ? `${label} ne doit pas dépasser ${details.max} caractères.`
        : label
          ? `${label} est trop long.`
          : null;
    case 'INVALID_FORMAT':
      return label ? `${label} a un format invalide.` : null;
    case 'NO_CHANGES':
      return 'Aucune modification à enregistrer.';
    default:
      return null;
  }
}

/**
 * Le champ public en faute, s'il est connu — pour cibler le focus côté formulaire.
 * Ne renvoie jamais un nom inconnu (retourne null si le field n'est pas répertorié).
 */
export function fieldInError(error: unknown): string | null {
  if (error instanceof ApiResponseError && error.details?.field) {
    return error.details.field in FIELD_LABELS ? error.details.field : null;
  }
  return null;
}

/**
 * Message d'erreur SÛR pour l'affichage utilisateur (C-03). Remplace l'ancien
 * `apiErrorMessage` de `./client` qui renvoyait le `error.message` brut.
 *
 * - Erreur API (`ApiResponseError`) → `translateApiError` : jamais le message
 *   brut, jamais `details.field`/`reason`, jamais de snake_case ; libellé
 *   français ou générique sûr.
 * - Erreur NON API (exception JS, échec réseau bas niveau) → `fallback` fourni
 *   par l'appelant (déjà un libellé français métier), jamais `error.message`.
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiResponseError) return translateApiError(error);
  return fallback;
}

export function translateApiError(error: unknown): string {
  if (!(error instanceof ApiResponseError)) return GENERIC_ERROR_MESSAGE;

  // 1) Erreur de validation avec details exploitables → message ciblé.
  if (error.code === 'VALIDATION_ERROR') {
    const described = describeValidation(error.details);
    if (described) return described;
    // Validation sans details reconnaissables : générique sûr (jamais le message brut).
    return GENERIC_ERROR_MESSAGE;
  }

  // 2) Code métier global connu.
  const byCode = CODE_MESSAGES[error.code];
  if (byCode) return byCode;

  // 3) Inconnu → générique sûr.
  return GENERIC_ERROR_MESSAGE;
}
