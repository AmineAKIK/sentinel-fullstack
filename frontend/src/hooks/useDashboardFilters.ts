import { ProductionLine } from '../types';
import { FilterChip } from '../components/FilterSummary';

export interface DashboardFilters {
  lineId: string;
  status: string;
  priority: string;
  taken: string;
  scope: string;
  query: string;
  aging: string;
}

interface UseDashboardFiltersProps {
  filters: DashboardFilters;
  setFilters: React.Dispatch<React.SetStateAction<DashboardFilters>>;
  lines: ProductionLine[];
}

export interface UseDashboardFiltersReturn {
  filterChips: FilterChip[];
  activeFilterCount: number;
  clearAllFilters: () => void;
}

export function buildDashboardFilterChips(
  filters: DashboardFilters,
  lines: ProductionLine[],
  setFilters: React.Dispatch<React.SetStateAction<DashboardFilters>>
): FilterChip[] {
  const selectedLineLabel = lines.find((line) => String(line.id) === filters.lineId)?.line_number || filters.lineId;
  const hasSearchFilter = filters.query.trim().length > 0;

  return [
    ...(hasSearchFilter ? [{
      key: 'search',
      label: `Recherche: ${filters.query.trim()}`,
      onRemove: () => setFilters((prev) => ({ ...prev, query: '' })),
    }] : []),
    ...(filters.status === 'OPEN' ? [{
      key: 'status-open',
      label: 'Ouverts',
      onRemove: () => setFilters((prev) => ({ ...prev, status: 'all' })),
    }] : []),
    ...(filters.status === 'PENDING' ? [{
      key: 'status-pending',
      label: 'En attente',
      onRemove: () => setFilters((prev) => ({ ...prev, status: 'all' })),
    }] : []),
    ...(filters.status === 'CLOSED' ? [{
      key: 'status-closed',
      label: 'Clôturés 7j',
      onRemove: () => setFilters((prev) => ({ ...prev, status: 'all' })),
    }] : []),
    ...(filters.aging === 'over_7d' ? [{
      key: 'aging',
      label: 'Ouverts > 7j',
      onRemove: () => setFilters((prev) => ({ ...prev, aging: 'all' })),
    }] : []),
    ...(filters.lineId !== 'all' ? [{
      key: 'line',
      label: `Ligne ${selectedLineLabel}`,
      onRemove: () => setFilters((prev) => ({ ...prev, lineId: 'all' })),
    }] : []),
    ...(filters.priority !== 'all' ? [{
      key: 'priority',
      label: filters.priority === 'urgent' ? 'Urgents' : 'Non urgents',
      onRemove: () => setFilters((prev) => ({ ...prev, priority: 'all' })),
    }] : []),
    ...(filters.taken !== 'all' ? [{
      key: 'taken',
      label: filters.taken === 'taken' ? 'Pris en charge' : 'Non pris',
      onRemove: () => setFilters((prev) => ({ ...prev, taken: 'all' })),
    }] : []),
    ...(filters.scope === 'followed' ? [{
      key: 'followed',
      label: 'Suivis',
      onRemove: () => setFilters((prev) => ({ ...prev, scope: 'all' })),
    }] : []),
    ...(filters.scope === 'assigned_to_me' ? [{
      key: 'assigned_to_me',
      label: 'Pris par moi',
      onRemove: () => setFilters((prev) => ({ ...prev, scope: 'all' })),
    }] : []),
    ...(filters.scope === 'created_by_me' ? [{
      key: 'created_by_me',
      label: 'Créés par moi',
      onRemove: () => setFilters((prev) => ({ ...prev, scope: 'all' })),
    }] : []),
  ];
}

export function computeActiveFilterCount(filters: DashboardFilters): number {
  const secondaryFilterCount = [
    filters.lineId !== 'all',
    filters.priority !== 'all',
    filters.taken !== 'all',
  ].filter(Boolean).length;
  const hasQuickFilter = filters.status !== 'all' || filters.aging !== 'all';
  const hasScopeFilter = filters.scope !== 'all';
  const hasSearchFilter = filters.query.trim().length > 0;
  return secondaryFilterCount + (hasQuickFilter ? 1 : 0) + (hasScopeFilter ? 1 : 0) + (hasSearchFilter ? 1 : 0);
}

export function useDashboardFilters({ filters, setFilters, lines }: UseDashboardFiltersProps): UseDashboardFiltersReturn {
  const filterChips = buildDashboardFilterChips(filters, lines, setFilters);
  const activeFilterCount = computeActiveFilterCount(filters);

  function clearAllFilters() {
    setFilters({
      lineId: 'all',
      status: 'all',
      priority: 'all',
      taken: 'all',
      scope: 'all',
      query: '',
      aging: 'all',
    });
  }

  return { filterChips, activeFilterCount, clearAllFilters };
}
