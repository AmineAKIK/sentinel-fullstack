import FilterSummary, { FilterChip } from './FilterSummary';
import SelectField from './ui/SelectField';
import { STATUS_LABELS, STATE_LABELS } from '../utils/labels';
import { getWorkshopMachineOptions } from '../utils/workshopFilters';
import { ProductionLine } from '../types';
import { HistoryStatusFilter, readHistoryStatusFilter } from '../hooks/useHistoryData';

type StatusFilterProps = {
  value: HistoryStatusFilter;
  onChange: (value: HistoryStatusFilter) => void;
};

type WorkshopFilterCardProps = {
  searchInputId: string;
  searchPlaceholder: string;
  query: string;
  onQueryChange: (value: string) => void;
  status?: StatusFilterProps;
  lines: ProductionLine[];
  lineFilter: string;
  onLineFilterChange: (value: string) => void;
  machineFilter: string;
  onMachineFilterChange: (value: string) => void;
  stateFilter: string;
  onStateFilterChange: (value: string) => void;
  count: number;
  countLabel: string;
  chips: FilterChip[];
  onClear: () => void;
  emptyText: string;
};

export default function WorkshopFilterCard({
  searchInputId,
  searchPlaceholder,
  query,
  onQueryChange,
  status,
  lines,
  lineFilter,
  onLineFilterChange,
  machineFilter,
  onMachineFilterChange,
  stateFilter,
  onStateFilterChange,
  count,
  countLabel,
  chips,
  onClear,
  emptyText,
}: WorkshopFilterCardProps) {
  const machineOptions = getWorkshopMachineOptions(lines, lineFilter);

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-body">
        <div className="history-grid">
          <div className="form-group">
            <label className="form-label" htmlFor={searchInputId}>
              Recherche
            </label>
            <input
              id={searchInputId}
              className="form-input"
              placeholder={searchPlaceholder}
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
            />
          </div>
          {status && (
            <div className="form-group">
              <label className="form-label" aria-hidden="true">
                Statut
              </label>
              <SelectField
                value={status.value}
                ariaLabel="Statut"
                onChange={(v) => status.onChange(readHistoryStatusFilter(v))}
                options={[
                  { value: 'all', label: 'Tous' },
                  ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
                ]}
              />
            </div>
          )}
          <div className="form-group">
            <label className="form-label" aria-hidden="true">
              Ligne
            </label>
            <SelectField
              value={lineFilter}
              ariaLabel="Ligne"
              onChange={onLineFilterChange}
              options={[
                { value: 'all', label: 'Toutes' },
                ...lines.map((l) => ({ value: String(l.id), label: l.line_number })),
              ]}
            />
          </div>
          <div className="form-group">
            <label className="form-label" aria-hidden="true">
              Machine
            </label>
            <SelectField
              value={machineFilter}
              ariaLabel="Machine"
              onChange={onMachineFilterChange}
              disabled={lineFilter === 'all'}
              options={[
                { value: 'all', label: 'Toutes' },
                ...machineOptions.map((m) => ({ value: m.id, label: m.label })),
              ]}
            />
          </div>
          <div className="form-group">
            <label className="form-label" aria-hidden="true">
              Type d'anomalie
            </label>
            <SelectField
              value={stateFilter}
              ariaLabel="Type d'anomalie"
              onChange={onStateFilterChange}
              options={[
                { value: 'all', label: 'Tous' },
                ...Object.entries(STATE_LABELS).map(([value, label]) => ({ value, label })),
              ]}
            />
          </div>
        </div>
        <FilterSummary
          count={count}
          countLabel={countLabel}
          chips={chips}
          onClear={onClear}
          emptyText={emptyText}
          className="filter-summary-embedded"
        />
      </div>
    </div>
  );
}
