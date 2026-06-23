import type { AttentionLevel } from './attention';

export const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** Vrai si la date ISO est plus ancienne que `days` jours par rapport à maintenant. */
export function isOlderThanDays(iso: string, days: number): boolean {
  return Date.now() - new Date(iso).getTime() > days * DAY_MS;
}

/**
 * Durée vécue depuis une date ISO, en langage court (« < 1 h », « 5 h », « 3 j »).
 * Le temps s'exprime en durée ressentie, pas en horodatage à déchiffrer (P7, §5.6).
 */
export function formatDuration(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const hours = Math.max(0, Math.floor(diffMs / HOUR_MS));
  if (hours < 1) return '< 1 h';
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} j`;
}

/**
 * Niveau d'attention dérivé de l'ancienneté (P7, §5.6). Montée progressive, sans
 * rupture brutale à un seuil : un incident qui vieillit s'élève doucement dans
 * l'échelle. Repères en jours, alignés sur la mécanique existante (« 7 jours »).
 */
export function ageAttentionLevel(iso: string): AttentionLevel {
  const ageDays = (Date.now() - new Date(iso).getTime()) / DAY_MS;
  if (ageDays >= 7) return 'critical';
  if (ageDays >= 3) return 'act';
  if (ageDays >= 1) return 'watch';
  return 'calm';
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
