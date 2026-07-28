import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import NavBar from '../components/NavBar';
import CreateLineModal from '../components/CreateLineModal';
import LineDetailView from '../components/LineDetailView';
import Modal from '../components/Modal';
import FilterSummary, { FilterChip } from '../components/FilterSummary';
import EmptyState from '../components/ui/EmptyState';
import ErrorBanner from '../components/ui/ErrorBanner';
import SuccessBanner from '../components/ui/SuccessBanner';
import SelectField from '../components/ui/SelectField';
import Spinner from '../components/ui/Spinner';
import { listLines } from '../api/lines';
import { ProductionLine } from '../types';
import { formatDate } from '../utils/date';
import { makeSortCodec } from '../utils/sortCodec';
import { usePageTitle } from '../hooks/usePageTitle';

const lineSortCodec = makeSortCodec([
  { key: 'line_asc', sort: 'line_number', order: 'asc' },
  { key: 'line_desc', sort: 'line_number', order: 'desc' },
  { key: 'status_asc', sort: 'status', order: 'asc' },
  { key: 'status_desc', sort: 'status', order: 'desc' },
  { key: 'created_asc', sort: 'created_at', order: 'asc' },
  { key: 'created_desc', sort: 'created_at', order: 'desc' },
]);

type LineSortField = 'line_number' | 'machines' | 'status' | 'created_at';
type SortOrder = 'asc' | 'desc';

export default function LinesPage() {
  usePageTitle('Gestion des lignes');
  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [selected, setSelected] = useState<ProductionLine | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [sort, setSort] = useState<LineSortField>('created_at');
  const [order, setOrder] = useState<SortOrder>('desc');
  const [draftStatus, setDraftStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [draftSortValue, setDraftSortValue] = useState('created_desc');
  const successTimerRef = useRef<number | null>(null);

  const showSuccess = useCallback((message: string): void => {
    if (successTimerRef.current !== null) window.clearTimeout(successTimerRef.current);
    setSuccessMsg(message);
    successTimerRef.current = window.setTimeout(() => {
      setSuccessMsg('');
      successTimerRef.current = null;
    }, 5000);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void listLines(controller.signal)
      .then(setLines)
      .catch(() => {
        if (!controller.signal.aborted) {
          setError('Impossible de charger la liste des lignes.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(
    () => () => {
      if (successTimerRef.current !== null) window.clearTimeout(successTimerRef.current);
    },
    []
  );

  function getSortValue(): string {
    return lineSortCodec.encode({ sort, order });
  }

  function applySortValue(value: string) {
    const { sort: s, order: o } = lineSortCodec.decode(value);
    setSort(s as LineSortField);
    setOrder(o as SortOrder);
  }

  function openFilters() {
    setDraftStatus(statusFilter);
    setDraftSortValue(getSortValue());
    setShowFilters(true);
  }

  function applyFilters() {
    setStatusFilter(draftStatus);
    applySortValue(draftSortValue);
    setShowFilters(false);
  }

  function resetFilters() {
    setDraftStatus('all');
    setDraftSortValue('created_desc');
  }

  function clearAllFilters() {
    setSearch('');
    setStatusFilter('all');
    setSort('created_at');
    setOrder('desc');
    setDraftStatus('all');
    setDraftSortValue('created_desc');
  }

  function toggleTableSort(field: LineSortField) {
    if (sort === field) {
      setOrder((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSort(field);
    setOrder(field === 'created_at' ? 'desc' : 'asc');
  }

  function headerAriaSort(field: LineSortField): 'ascending' | 'descending' | 'none' {
    if (sort !== field) return 'none';
    return order === 'asc' ? 'ascending' : 'descending';
  }

  function headerSortLabel(field: LineSortField): string {
    if (sort !== field) return 'Trier';
    return order === 'asc' ? 'Tri ascendant' : 'Tri descendant';
  }

  const filteredLines = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = lines.filter((line) => {
      if (statusFilter === 'active' && !line.is_active) return false;
      if (statusFilter === 'inactive' && line.is_active) return false;
      if (!needle) return true;
      const firstMachine = line.machines[0]?.machineId || '';
      const lastMachine = line.machines[line.machines.length - 1]?.machineId || '';
      const haystack = [line.line_number, firstMachine, lastMachine, String(line.machines.length)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });

    return [...filtered].sort((a, b) => {
      const dir = order === 'asc' ? 1 : -1;
      if (sort === 'line_number') return dir * a.line_number.localeCompare(b.line_number);
      if (sort === 'machines') return dir * (a.machines.length - b.machines.length);
      if (sort === 'status') return dir * (Number(a.is_active) - Number(b.is_active));
      return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    });
  }, [lines, search, statusFilter, sort, order]);

  const filterChips: FilterChip[] = [
    ...(search.trim()
      ? [{ key: 'search', label: `Recherche: ${search.trim()}`, onRemove: () => setSearch('') }]
      : []),
    ...(statusFilter !== 'all'
      ? [
          {
            key: 'status',
            label: `Statut: ${statusFilter === 'active' ? 'Actif' : 'Inactif'}`,
            onRemove: () => setStatusFilter('all'),
          },
        ]
      : []),
    ...(sort !== 'created_at' || order !== 'desc'
      ? [
          {
            key: 'sort',
            label: 'Tri personnalisé',
            onRemove: () => {
              setSort('created_at');
              setOrder('desc');
            },
          },
        ]
      : []),
  ];

  // ── Detail view ────────────────────────────────────────────────────────────
  if (selected) {
    return (
      <LineDetailView
        line={selected}
        successMsg={successMsg}
        error={error}
        onBack={() => setSelected(null)}
        onLineUpdated={(updated, message) => {
          setSelected(updated);
          setLines((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
          showSuccess(message);
        }}
        onLineDeleted={(line) => {
          setLines((prev) => prev.filter((l) => l.id !== line.id));
          setSelected(null);
          showSuccess(`Ligne ${line.line_number} archivée avec succès.`);
        }}
      />
    );
  }

  // ── List view ──────────────────────────────────────────────────────────────
  return (
    <>
      <NavBar />
      <main id="main-content" className="page-container">
        <div className="page-header">
          <h1>Gestion des lignes</h1>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            + Ajouter une ligne
          </button>
        </div>

        {successMsg && <SuccessBanner style={{ marginBottom: 16 }}>{successMsg}</SuccessBanner>}

        <div className="filters-row">
          <div className="filter-group">
            <span className="filter-label">Recherche</span>
            <input
              className="form-input"
              placeholder="Numéro de ligne, machine..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Recherche libre"
            />
          </div>
          <div className="filter-group">
            <span className="filter-label">Filtres</span>
            <button className="btn btn-secondary" type="button" onClick={openFilters}>
              Filtrer
            </button>
          </div>
        </div>

        <FilterSummary
          count={filteredLines.length}
          countLabel={{ singular: 'ligne affichée', plural: 'lignes affichées' }}
          chips={filterChips}
          onClear={clearAllFilters}
        />

        <div className="card user-list-panel">
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
              <Spinner size={24} borderWidth={3} />
            </div>
          ) : error ? (
            <ErrorBanner style={{ margin: 20 }}>{error}</ErrorBanner>
          ) : filteredLines.length === 0 ? (
            <EmptyState>Aucune ligne trouvée.</EmptyState>
          ) : (
            <>
              <div className="table-wrapper line-table-wrapper">
                <table style={{ tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: '20%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '16%' }} />
                    <col style={{ width: '16%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '14%' }} />
                    <col style={{ width: '40px' }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th scope="col" aria-sort={headerAriaSort('line_number')}>
                        <button
                          className="table-sort-button"
                          type="button"
                          onClick={() => toggleTableSort('line_number')}
                        >
                          Numéro de ligne
                          <span className="sr-only">{headerSortLabel('line_number')}</span>
                        </button>
                      </th>
                      <th scope="col">Machines</th>
                      <th scope="col">Première machine</th>
                      <th scope="col">Dernière machine</th>
                      <th scope="col" aria-sort={headerAriaSort('status')}>
                        <button
                          className="table-sort-button"
                          type="button"
                          onClick={() => toggleTableSort('status')}
                        >
                          Statut
                          <span className="sr-only">{headerSortLabel('status')}</span>
                        </button>
                      </th>
                      <th scope="col" aria-sort={headerAriaSort('created_at')}>
                        <button
                          className="table-sort-button"
                          type="button"
                          onClick={() => toggleTableSort('created_at')}
                        >
                          Date création
                          <span className="sr-only">{headerSortLabel('created_at')}</span>
                        </button>
                      </th>
                      <th scope="col" aria-label="Actions"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLines.map((line) => (
                      <tr key={line.id}>
                        <td>
                          <strong>{line.line_number}</strong>
                        </td>
                        <td>{line.machines.length}</td>
                        <td>{line.machines[0]?.machineId || '-'}</td>
                        <td>{line.machines[line.machines.length - 1]?.machineId || '-'}</td>
                        <td>
                          <span
                            className={`badge-status ${line.is_active ? 'active' : 'inactive'}`}
                          >
                            {line.is_active ? 'Actif' : 'Inactif'}
                          </span>
                        </td>
                        <td>{formatDate(line.created_at)}</td>
                        <td className="row-action">
                          <button
                            type="button"
                            className="row-action-button"
                            onClick={() => setSelected(line)}
                            aria-label={`Voir la ligne ${line.line_number}`}
                          >
                            <svg className="row-action-icon" viewBox="0 0 24 24" aria-hidden="true">
                              <path
                                d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41L18.37 3.29c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
                                fill="currentColor"
                              />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="line-card-list">
                {filteredLines.map((line) => (
                  <button
                    className="user-card-row"
                    key={line.id}
                    type="button"
                    onClick={() => setSelected(line)}
                    aria-label={`Voir la ligne ${line.line_number}`}
                  >
                    <span className="user-card-main">
                      <span className="user-card-name">
                        <strong>Ligne {line.line_number}</strong>
                      </span>
                      <span className="user-card-badge">
                        {line.machines.length} machine{line.machines.length > 1 ? 's' : ''}
                        {line.machines[0]
                          ? ` · ${line.machines[0].machineId} → ${line.machines[line.machines.length - 1].machineId}`
                          : ''}
                      </span>
                    </span>
                    <span className="user-card-meta">
                      <span className={`badge-status ${line.is_active ? 'active' : 'inactive'}`}>
                        {line.is_active ? 'Actif' : 'Inactif'}
                      </span>
                    </span>
                    <span className="user-card-footer">
                      <span>{formatDate(line.created_at)}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </main>

      {showCreate && (
        <CreateLineModal
          onClose={() => setShowCreate(false)}
          onSuccess={(line) => {
            setShowCreate(false);
            setLines((prev) => [line, ...prev]);
            showSuccess(`Ligne ${line.line_number} créée avec succès.`);
          }}
        />
      )}

      {showFilters && (
        <Modal
          title="Filtrer les lignes"
          onClose={() => setShowFilters(false)}
          size="sm"
          footer={
            <>
              <button className="btn btn-secondary" onClick={resetFilters}>
                Réinitialiser
              </button>
              <button className="btn btn-primary" onClick={applyFilters}>
                Appliquer
              </button>
            </>
          }
        >
          <div className="form-group">
            <label className="form-label">Statut</label>
            <SelectField
              value={draftStatus}
              onChange={(value) => setDraftStatus(value as 'all' | 'active' | 'inactive')}
              options={[
                { value: 'all', label: 'Tous' },
                { value: 'active', label: 'Actif' },
                { value: 'inactive', label: 'Inactif' },
              ]}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Trier par</label>
            <SelectField
              value={draftSortValue}
              onChange={setDraftSortValue}
              options={[
                { value: 'created_desc', label: 'Plus récentes' },
                { value: 'created_asc', label: 'Plus anciennes' },
                { value: 'line_asc', label: 'Numéro de ligne A-Z' },
                { value: 'line_desc', label: 'Numéro de ligne Z-A' },
                { value: 'status_asc', label: 'Actifs en premier' },
                { value: 'status_desc', label: 'Inactifs en premier' },
              ]}
            />
          </div>
        </Modal>
      )}
    </>
  );
}
