export const ROLE_LABELS: Record<string, string> = {
  OPERATOR: 'Opérateur',
  MAINTENANCE: 'Maintenance',
  RESPONSABLE: 'Responsable',
};

export const SHIFT_LABELS: Record<string, string> = {
  MATIN: 'Matin',
  APRES_MIDI: 'Après-midi',
  NUIT: 'Nuit',
  WEEKEND: 'Weekend',
};

export const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Ouvert',
  PENDING: 'En attente',
  CLOSED: 'Clôturé',
  CANCELED: 'Annulé',
};

export const STATE_LABELS: Record<string, string> = {
  SKIPEE_PAR_MACHINE: 'Skipée par machine',
  SKIPEE_PAR_CONDUCTEUR: 'Skipée par conducteur',
  DEGRADEE: 'Dégradée',
  INDISPONIBLE: 'Indisponible',
};
