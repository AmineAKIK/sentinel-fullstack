export const DAY_MS = 24 * 60 * 60 * 1000;

/** Vrai si la date ISO est plus ancienne que `days` jours par rapport à maintenant. */
export function isOlderThanDays(iso: string, days: number): boolean {
  return Date.now() - new Date(iso).getTime() > days * DAY_MS;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatSeconds(value: number | null): string {
  if (!value || value <= 0) return '-';
  const minutes = Math.round(value / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return `${hours} h`;
}
