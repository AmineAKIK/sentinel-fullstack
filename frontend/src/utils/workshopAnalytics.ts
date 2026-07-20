import { AnalyticsParams } from '../api/workshop';
import { HistoryPeriod } from './workshopHistory';

/**
 * Borne de début de journée en ISO 8601. Une date sans heure (`YYYY-MM-DD`)
 * est déjà interprétée à minuit par le moteur JS — aucun recalage nécessaire.
 */
export function dayStartIso(dateInput: string): string {
  return new Date(dateInput).toISOString();
}

/** Borne de fin de journée (23:59:59.999, horloge locale) en ISO 8601. */
export function dayEndIso(dateInput: string): string {
  const date = new Date(dateInput);
  date.setHours(23, 59, 59, 999);
  return date.toISOString();
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
  if (period === '7d' || period === '30d') {
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - (period === '7d' ? 7 : 30));
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
