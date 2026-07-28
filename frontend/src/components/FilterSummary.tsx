import { inflect } from '../utils/french';

export type FilterChip = {
  key: string;
  label: string;
  onRemove: () => void;
};

export type CountLabel = string | { singular: string; plural: string };

type FilterSummaryProps = {
  count: number;
  countLabel: CountLabel;
  chips: FilterChip[];
  onClear?: () => void;
  emptyText?: string;
  className?: string;
};

export default function FilterSummary({
  count,
  countLabel,
  chips,
  onClear,
  emptyText = 'Aucun filtre actif',
  className = '',
}: FilterSummaryProps) {
  const hasFilters = chips.length > 0;
  const resolvedCountLabel =
    typeof countLabel === 'string'
      ? countLabel
      : inflect(count, countLabel.singular, countLabel.plural);

  return (
    <div className={`filter-summary ${className}`.trim()}>
      <div className="filter-summary-main">
        <span className="filter-result-count">
          {count} {resolvedCountLabel}
        </span>
        {hasFilters ? (
          <div className="filter-chip-list">
            {chips.map((chip) => (
              <button
                key={chip.key}
                className="filter-chip"
                type="button"
                onClick={chip.onRemove}
                aria-label={`Retirer le filtre ${chip.label}`}
              >
                <span>{chip.label}</span>
                <span aria-hidden="true">×</span>
              </button>
            ))}
          </div>
        ) : (
          <span className="muted">{emptyText}</span>
        )}
      </div>
      {onClear && (
        <button
          className="btn btn-secondary btn-sm"
          type="button"
          onClick={onClear}
          disabled={!hasFilters}
        >
          Effacer les filtres
        </button>
      )}
    </div>
  );
}
