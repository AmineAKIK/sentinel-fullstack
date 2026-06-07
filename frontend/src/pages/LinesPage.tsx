import { useEffect, useMemo, useState } from 'react';
import NavBar from '../components/NavBar';
import CreateLineModal from '../components/CreateLineModal';
import EditLineModal from '../components/EditLineModal';
import DeleteLineConfirmModal from '../components/DeleteLineConfirmModal';
import EditMachineModal from '../components/EditMachineModal';
import LinePlanModal from '../components/LinePlanModal';
import Modal from '../components/Modal';
import FilterSummary, { FilterChip } from '../components/FilterSummary';
import DetailField from '../components/ui/DetailField';
import EmptyState from '../components/ui/EmptyState';
import ErrorBanner from '../components/ui/ErrorBanner';
import SelectField from '../components/ui/SelectField';
import Spinner from '../components/ui/Spinner';
import { listLines } from '../api/lines';
import { LineMachine, ProductionLine } from '../types';
import { formatDate } from '../utils/date';

type LineSortField = 'line_number' | 'machines' | 'status' | 'created_at';
type SortOrder = 'asc' | 'desc';

function robotLabel(machine: LineMachine): string {
  if (machine.hasDoubleRobot) {
    return `Gauche ${machine.leftRobotNumber} (${machine.leftRobotHeads} têtes) / Droite ${machine.rightRobotNumber} (${machine.rightRobotHeads} têtes)`;
  }
  return `${machine.robotNumber} (${machine.robotHeads} têtes)`;
}

export default function LinesPage() {
  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [selected, setSelected] = useState<ProductionLine | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [editMachineIndex, setEditMachineIndex] = useState<number | null>(null);
  const [showPlan, setShowPlan] = useState(false);
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

  useEffect(() => {
    setLoading(true);
    setError('');
    listLines()
      .then(setLines)
      .catch(() => setError('Impossible de charger la liste des lignes.'))
      .finally(() => setLoading(false));
  }, []);

  function getSortValue(): string {
    if (sort === 'line_number' && order === 'asc') return 'line_asc';
    if (sort === 'line_number' && order === 'desc') return 'line_desc';
    if (sort === 'status' && order === 'asc') return 'status_asc';
    if (sort === 'status' && order === 'desc') return 'status_desc';
    if (sort === 'created_at' && order === 'asc') return 'created_asc';
    return 'created_desc';
  }

  function applySortValue(value: string) {
    if (value === 'line_asc') { setSort('line_number'); setOrder('asc'); }
    else if (value === 'line_desc') { setSort('line_number'); setOrder('desc'); }
    else if (value === 'status_asc') { setSort('status'); setOrder('asc'); }
    else if (value === 'status_desc') { setSort('status'); setOrder('desc'); }
    else if (value === 'created_asc') { setSort('created_at'); setOrder('asc'); }
    else { setSort('created_at'); setOrder('desc'); }
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
    ...(search.trim() ? [{ key: 'search', label: `Recherche: ${search.trim()}`, onRemove: () => setSearch('') }] : []),
    ...(statusFilter !== 'all' ? [{ key: 'status', label: `Statut: ${statusFilter === 'active' ? 'Actif' : 'Inactif'}`, onRemove: () => setStatusFilter('all') }] : []),
    ...(sort !== 'created_at' || order !== 'desc' ? [{ key: 'sort', label: 'Tri personnalisé', onRemove: () => { setSort('created_at'); setOrder('desc'); } }] : []),
  ];

  // ── Detail view ────────────────────────────────────────────────────────────
  if (selected) {
    return (
      <>
        <NavBar />
        <main id="main-content" className="page-container">
          <button className="back-link" onClick={() => setSelected(null)}>
            Retour à la liste
          </button>

          <div className="page-header">
            <h1>Ligne {selected.line_number}</h1>
            <div className="action-bar" style={{ marginTop: 0 }}>
              <button className="btn btn-secondary" onClick={() => setShowPlan(true)}>Plan de la ligne</button>
              <button className="btn btn-secondary" onClick={() => setShowEdit(true)}>Modifier</button>
              <button className="btn btn-danger" onClick={() => setShowDelete(true)}>Supprimer</button>
            </div>
          </div>

          {successMsg && <div className="success-message" style={{ marginBottom: 16 }}>{successMsg}</div>}
          {error && <ErrorBanner style={{ marginBottom: 16 }}>{error}</ErrorBanner>}

          <div className="card">
            <div className="card-body">
              <div className="detail-grid" style={{ marginBottom: 20 }}>
                <DetailField label="Numéro de ligne">{selected.line_number}</DetailField>
                <DetailField label="Machines">{selected.machines.length}</DetailField>
                <DetailField label="Statut">
                  <span className={`badge-status ${selected.is_active ? 'active' : 'inactive'}`}>
                    {selected.is_active ? 'Actif' : 'Inactif'}
                  </span>
                </DetailField>
                <DetailField label="Date de création">{formatDate(selected.created_at)}</DetailField>
              </div>

              <div className="notice" style={{ marginBottom: 16 }}>
                Ordre d'affichage : de la SPI vers le four.
              </div>

              <div className="line-detail-list">
                {selected.machines.map((machine, index) => (
                  <div
                    className="line-detail-item"
                    key={`${machine.machineId}-${index}`}
                    onClick={() => setEditMachineIndex(index)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditMachineIndex(index); } }}
                  >
                    <span className="line-detail-order">{index + 1}</span>
                    <div>
                      <strong>{machine.machineId}</strong>
                      <div className="line-detail-meta">
                        {machine.brand} · {machine.hasDoubleRobot ? 'Double robot' : 'Robot unique'} · {robotLabel(machine)}
                      </div>
                    </div>
                    <span className="line-detail-edit" aria-hidden="true">
                      <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
                        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41L18.37 3.29c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor" />
                      </svg>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>

        {showEdit && (
          <EditLineModal
            line={selected}
            onClose={() => setShowEdit(false)}
            onSuccess={(updated) => {
              setShowEdit(false);
              setSelected(updated);
              setLines((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
              setSuccessMsg(`Ligne ${updated.line_number} modifiée avec succès.`);
              setTimeout(() => setSuccessMsg(''), 4000);
            }}
          />
        )}
        {showDelete && (
          <DeleteLineConfirmModal
            line={selected}
            onClose={() => setShowDelete(false)}
            onSuccess={() => {
              setShowDelete(false);
              setLines((prev) => prev.filter((l) => l.id !== selected.id));
              setSelected(null);
              setSuccessMsg(`Ligne ${selected.line_number} supprimée avec succès.`);
              setTimeout(() => setSuccessMsg(''), 4000);
            }}
          />
        )}
        {showPlan && (
          <LinePlanModal
            line={selected}
            onClose={() => setShowPlan(false)}
            onSuccess={(updated) => {
              setShowPlan(false);
              setSelected(updated);
              setLines((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
              setSuccessMsg('Ordre des machines mis à jour.');
              setTimeout(() => setSuccessMsg(''), 4000);
            }}
          />
        )}
        {editMachineIndex !== null && (
          <EditMachineModal
            line={selected}
            machineIndex={editMachineIndex}
            onClose={() => setEditMachineIndex(null)}
            onSuccess={(updated) => {
              setEditMachineIndex(null);
              setSelected(updated);
              setLines((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
              setSuccessMsg('Machine modifiée avec succès.');
              setTimeout(() => setSuccessMsg(''), 4000);
            }}
          />
        )}
      </>
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

        {successMsg && <div className="success-message" style={{ marginBottom: 16 }}>{successMsg}</div>}

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
          countLabel="ligne(s) affichée(s)"
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
                <table>
                  <thead>
                    <tr>
                      <th aria-sort={headerAriaSort('line_number')}>
                        <button className="table-sort-button" type="button" onClick={() => toggleTableSort('line_number')}>
                          Numéro de ligne
                          <span className="sr-only">{headerSortLabel('line_number')}</span>
                        </button>
                      </th>
                      <th>Machines</th>
                      <th>Première machine</th>
                      <th>Dernière machine</th>
                      <th aria-sort={headerAriaSort('status')}>
                        <button className="table-sort-button" type="button" onClick={() => toggleTableSort('status')}>
                          Statut
                          <span className="sr-only">{headerSortLabel('status')}</span>
                        </button>
                      </th>
                      <th aria-sort={headerAriaSort('created_at')}>
                        <button className="table-sort-button" type="button" onClick={() => toggleTableSort('created_at')}>
                          Date création
                          <span className="sr-only">{headerSortLabel('created_at')}</span>
                        </button>
                      </th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLines.map((line) => (
                      <tr
                        key={line.id}
                        onClick={() => setSelected(line)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(line); } }}
                        role="button"
                        tabIndex={0}
                        aria-label={`Voir la ligne ${line.line_number}`}
                      >
                        <td><strong>{line.line_number}</strong></td>
                        <td>{line.machines.length}</td>
                        <td>{line.machines[0]?.machineId || '-'}</td>
                        <td>{line.machines[line.machines.length - 1]?.machineId || '-'}</td>
                        <td>
                          <span className={`badge-status ${line.is_active ? 'active' : 'inactive'}`}>
                            {line.is_active ? 'Actif' : 'Inactif'}
                          </span>
                        </td>
                        <td>{formatDate(line.created_at)}</td>
                        <td className="row-action" aria-hidden="true">
                          <svg className="row-action-icon" viewBox="0 0 24 24" role="img" aria-label="Voir">
                            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41L18.37 3.29c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor" />
                          </svg>
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
                        {line.machines[0] ? ` · ${line.machines[0].machineId} → ${line.machines[line.machines.length - 1].machineId}` : ''}
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
            setSuccessMsg(`Ligne ${line.line_number} créée avec succès.`);
            setTimeout(() => setSuccessMsg(''), 4000);
          }}
        />
      )}

      {showFilters && (
        <Modal
          title="Filtrer les lignes"
          onClose={() => setShowFilters(false)}
          size="sm"
          footer={(
            <>
              <button className="btn btn-secondary" onClick={resetFilters}>Réinitialiser</button>
              <button className="btn btn-primary" onClick={applyFilters}>Appliquer</button>
            </>
          )}
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
