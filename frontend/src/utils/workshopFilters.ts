import type { IncidentWorkspaceParams } from '../api/workshop';
import type { FilterChip } from '../components/FilterSummary';
import type { ProductionLine } from '../types';
import { STATE_LABELS } from './workshopHistory';

export function getWorkshopMachineOptions(lines: ProductionLine[], lineFilter: string): { id: string; label: string }[] {
  const line = lines.find((item) => String(item.id) === lineFilter);
  if (!line) return [];
  return line.machines.map((machine) => ({ id: machine.machineId, label: machine.machineId }));
}

export function withWorkshopUrlFilter(
  searchParams: URLSearchParams,
  name: string,
  value: string,
  fallback = 'all',
): URLSearchParams {
  const nextParams = new URLSearchParams(searchParams);
  if (!value || value === fallback) nextParams.delete(name);
  else nextParams.set(name, value);
  return nextParams;
}

export function withWorkshopLineFilter(searchParams: URLSearchParams, value: string): URLSearchParams {
  const nextParams = new URLSearchParams(searchParams);
  if (value === 'all') nextParams.delete('line');
  else nextParams.set('line', value);
  nextParams.delete('machine');
  return nextParams;
}

export function buildIncidentWorkspaceParams(filters: {
  query: string;
  limit: number;
  statusFilter?: string;
  stateFilter: string;
  lineFilter: string;
  machineFilter: string;
  eventTypeFilter?: string;
}): IncidentWorkspaceParams {
  const params: IncidentWorkspaceParams = { limit: filters.limit };
  const trimmedQuery = filters.query.trim();

  if (trimmedQuery) params.q = trimmedQuery;
  if (filters.statusFilter && filters.statusFilter !== 'all') {
    params.status = filters.statusFilter as IncidentWorkspaceParams['status'];
  }
  if (filters.stateFilter !== 'all') {
    params.state = filters.stateFilter as IncidentWorkspaceParams['state'];
  }
  if (filters.lineFilter !== 'all') params.lineId = Number(filters.lineFilter);
  if (filters.machineFilter !== 'all') params.machineId = filters.machineFilter;
  if (filters.eventTypeFilter && filters.eventTypeFilter !== 'all') params.eventType = filters.eventTypeFilter;

  return params;
}

export function searchFilterChip(query: string, onRemove: () => void): FilterChip[] {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];
  return [{ key: 'search', label: `Recherche: ${trimmedQuery}`, onRemove }];
}

export function lineFilterChip(lines: ProductionLine[], lineFilter: string, onRemove: () => void): FilterChip[] {
  if (lineFilter === 'all') return [];
  const label = lines.find((line) => String(line.id) === lineFilter)?.line_number || lineFilter;
  return [{ key: 'line', label: `Ligne ${label}`, onRemove }];
}

export function machineFilterChip(machineFilter: string, onRemove: () => void): FilterChip[] {
  if (machineFilter === 'all') return [];
  return [{ key: 'machine', label: `Machine ${machineFilter}`, onRemove }];
}

export function stateFilterChip(stateFilter: string, onRemove: () => void): FilterChip[] {
  if (stateFilter === 'all') return [];
  return [{
    key: 'state',
    label: `État ligne : ${STATE_LABELS[stateFilter] || stateFilter}`,
    onRemove,
  }];
}
