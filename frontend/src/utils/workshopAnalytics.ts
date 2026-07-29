import { AnalyticsParams } from '../api/workshop';
import { HistoryPeriod } from './workshopHistory';

/**
 * Borne de début de journée locale en ISO 8601. Une date seule (`YYYY-MM-DD`)
 * serait interprétée en UTC par le moteur JS : l'heure explicite sans fuseau
 * conserve le jour civil choisi dans le navigateur.
 */
export function dayStartIso(dateInput: string): string {
  return new Date(`${dateInput}T00:00:00.000`).toISOString();
}

/** Borne de fin de journée (23:59:59.999, horloge locale) en ISO 8601. */
export function dayEndIso(dateInput: string): string {
  return new Date(`${dateInput}T23:59:59.999`).toISOString();
}

/** Sérialise une Date en `YYYY-MM-DD` (jour local), format natif d'un `<input type="date">`. */
function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export type PresetDateRange = { start: string; end: string };

/**
 * Bornes effectives d'un preset non personnalisé, au format `YYYY-MM-DD`
 * (jour local) — mêmes règles que `buildAnalyticsParams`, pour affichage
 * dans les champs Début/Fin quand un preset est actif. `null` pour `custom`,
 * qui n'a pas de bornes calculées : ce sont les valeurs saisies par l'utilisateur.
 */
export function presetDateRange(period: HistoryPeriod): PresetDateRange | null {
  const end = new Date();
  if (period === 'today') {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return { start: toDateInputValue(start), end: toDateInputValue(end) };
  }
  if (period === '7d' || period === '30d' || period === 'lifetime') {
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const start = new Date();
    start.setDate(end.getDate() - days);
    return { start: toDateInputValue(start), end: toDateInputValue(end) };
  }
  return null;
}

export function buildAnalyticsParams(
  period: HistoryPeriod,
  customStart: string,
  customEnd: string,
  lineFilter: string,
  machineFilter: string
): AnalyticsParams {
  const params: AnalyticsParams = {};
  const endDate = new Date();

  if (period === 'today') {
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    params.start = startDate.toISOString();
    params.end = endDate.toISOString();
  }
  if (period === '7d' || period === '30d' || period === 'lifetime') {
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);
    params.start = startDate.toISOString();
    params.end = endDate.toISOString();
  }
  if (period === 'custom') {
    if (customStart) params.start = dayStartIso(customStart);
    if (customEnd) params.end = dayEndIso(customEnd);
  }
  if (lineFilter !== 'all') params.lineId = Number(lineFilter);
  if (machineFilter !== 'all') params.machineId = machineFilter;
  return params;
}
