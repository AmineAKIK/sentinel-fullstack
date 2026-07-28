import Modal from './Modal';
import FilterSummary, { FilterChip } from './FilterSummary';
import { ProductionLine } from '../types';
import type { Dispatch, SetStateAction } from 'react';
import type { DashboardFilters as Filters } from '../hooks/useDashboardFilters';

interface DashboardFiltersProps {
  lines: ProductionLine[];
  filters: Filters;
  onSetFilters: Dispatch<SetStateAction<Filters>>;
  onClose: () => void;
  filteredCount: number;
  filterChips: FilterChip[];
}

export default function DashboardFilters({
  lines,
  filters,
  onSetFilters,
  onClose,
  filteredCount,
  filterChips,
}: DashboardFiltersProps) {
  return (
    <Modal
      title="Filtres"
      onClose={onClose}
      size="md"
      footer={
        <>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() =>
              onSetFilters((prev: Filters) => ({
                ...prev,
                lineId: 'all',
                status: 'all',
                priority: 'all',
                taken: 'all',
                scope: 'all',
                aging: 'all',
                query: '',
              }))
            }
          >
            Tout effacer
          </button>
          <button className="btn btn-primary" type="button" onClick={onClose}>
            Appliquer
          </button>
        </>
      }
    >
      <div className="board-settings-panel dashboard-filter-panel">
        <div className="notice">Portée : liste du tableau de bord uniquement.</div>

        <section className="board-settings-section dashboard-line-filter-section">
          <div>
            <h3>Périmètre</h3>
            <p>Réduit la liste opérationnelle à une ligne précise.</p>
          </div>
          <div className="board-line-chip-grid">
            <label className={`board-line-select-chip ${filters.lineId === 'all' ? 'active' : ''}`}>
              <input
                type="checkbox"
                checked={filters.lineId === 'all'}
                onChange={() => onSetFilters((prev: Filters) => ({ ...prev, lineId: 'all' }))}
              />
              <span>Toutes les lignes</span>
              <strong>{filters.lineId === 'all' ? 'incluse' : 'vue globale'}</strong>
            </label>
            {lines.map((line) => {
              const selected = filters.lineId === String(line.id);
              return (
                <label
                  className={`board-line-select-chip ${selected ? 'active' : ''}`}
                  key={line.id}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() =>
                      onSetFilters((prev: Filters) => ({
                        ...prev,
                        lineId: selected ? 'all' : String(line.id),
                      }))
                    }
                  />
                  <span>Ligne {line.line_number}</span>
                  <strong>{selected ? 'incluse' : 'disponible'}</strong>
                </label>
              );
            })}
          </div>
        </section>

        <FilterSummary
          count={filteredCount}
          countLabel={{ singular: 'incident affiché', plural: 'incidents affichés' }}
          chips={filterChips}
          emptyText="Aucun filtre actif"
          className="filter-summary-embedded"
        />
      </div>
    </Modal>
  );
}
