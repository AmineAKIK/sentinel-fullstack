import type { AttentionLevel } from './attention';

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Vrai si la date ISO est plus ancienne que `days` jours par rapport à maintenant. */
export function isOlderThanDays(iso: string, days: number): boolean {
  return Date.now() - new Date(iso).getTime() > days * DAY_MS;
}

/**
 * Durée vécue, en langage court et précis : « 30 min », « 5 h », « 2 j 17 h ».
 * Source unique de la « durée ressentie » dans toute l'app (P7, §5.6) — pour
 * « depuis X » comme pour une durée entre deux instants.
 *
 * @param fromIso  début de la période (ISO)
 * @param toIso    fin de la période (ISO) ; par défaut « maintenant »
 */
export function formatElapsed(fromIso: string, toIso?: string): string {
  const end = toIso ? new Date(toIso).getTime() : Date.now();
  const diffMs = end - new Date(fromIso).getTime();
  if (diffMs <= 0) return '—';
  const totalMinutes = Math.floor(diffMs / 60000);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) return `${totalHours} h`;
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return hours > 0 ? `${days} j ${hours} h` : `${days} j`;
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
