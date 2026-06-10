import { AnalyticsParams } from '../api/workshop';
import { HistoryPeriod } from './workshopHistory';

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
    if (customStart) params.start = new Date(customStart).toISOString();
    if (customEnd) {
      const customEndDate = new Date(customEnd);
      customEndDate.setHours(23, 59, 59, 999);
      params.end = customEndDate.toISOString();
    }
  }
  if (lineFilter !== 'all') params.lineId = Number(lineFilter);
  if (machineFilter !== 'all') params.machineId = machineFilter;
  return params;
}
