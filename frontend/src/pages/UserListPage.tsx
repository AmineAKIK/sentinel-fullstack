import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import NavBar from '../components/NavBar';
import CreateUserModal from '../components/CreateUserModal';
import Modal from '../components/Modal';
import FilterSummary, { FilterChip } from '../components/FilterSummary';
import { listAccounts } from '../api/accounts';
import { SentinelUser, Role, SortField, SortOrder } from '../types';
import { ROLE_LABELS } from '../utils/labels';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export default function UserListPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<SentinelUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const [filterRole, setFilterRole] = useState<Role | ''>('');
  const [sort, setSort] = useState<SortField>('created_at');
  const [order, setOrder] = useState<SortOrder>('desc');
  const [search, setSearch] = useState('');
  const [draftRole, setDraftRole] = useState<Role | ''>('');
  const [draftSortValue, setDraftSortValue] = useState('created_desc');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [draftStatus, setDraftStatus] = useState<'all' | 'active' | 'inactive'>('all');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listAccounts({ role: filterRole, sort, order });
      setUsers(data);
    } catch {
      setError('Impossible de charger la liste des utilisateurs.');
    } finally {
      setLoading(false);
    }
  }, [filterRole, sort, order]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  function handleSortChange(value: string) {
    if (value === 'alpha_asc') { setSort('alphabetical'); setOrder('asc'); }
    else if (value === 'alpha_desc') { setSort('alphabetical'); setOrder('desc'); }
    else if (value === 'created_asc') { setSort('created_at'); setOrder('asc'); }
    else { setSort('created_at'); setOrder('desc'); }
  }

  function getSortValue(): string {
    if (sort === 'alphabetical' && order === 'asc') return 'alpha_asc';
    if (sort === 'alphabetical' && order === 'desc') return 'alpha_desc';
    if (sort === 'created_at' && order === 'asc') return 'created_asc';
    return 'created_desc';
  }

  const filteredUsers = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return users.filter((user) => {
      if (statusFilter === 'active' && !user.is_active) return false;
      if (statusFilter === 'inactive' && user.is_active) return false;
      if (!needle) return true;
      const haystack = [
        user.first_name,
        user.last_name,
        user.badge_number,
        ROLE_LABELS[user.role],
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [users, search, statusFilter]);

  const filterChips: FilterChip[] = [
    ...(search.trim() ? [{
      key: 'search',
      label: `Recherche: ${search.trim()}`,
      onRemove: () => setSearch(''),
    }] : []),
    ...(filterRole ? [{
      key: 'role',
      label: `Rôle: ${ROLE_LABELS[filterRole] || filterRole}`,
      onRemove: () => setFilterRole(''),
    }] : []),
    ...(statusFilter !== 'all' ? [{
      key: 'status',
      label: `Statut: ${statusFilter === 'active' ? 'Actif' : 'Inactif'}`,
      onRemove: () => setStatusFilter('all'),
    }] : []),
    ...(getSortValue() !== 'created_desc' ? [{
      key: 'sort',
      label: 'Tri personnalisé',
      onRemove: () => {
        setSort('created_at');
        setOrder('desc');
      },
    }] : []),
  ];

  function openFilters() {
    setDraftRole(filterRole);
    setDraftSortValue(getSortValue());
    setDraftStatus(statusFilter);
    setShowFilters(true);
  }

  function applyFilters() {
    setFilterRole(draftRole);
    handleSortChange(draftSortValue);
    setStatusFilter(draftStatus);
    setShowFilters(false);
  }

  function resetFilters() {
    setDraftRole('');
    setDraftSortValue('created_desc');
    setDraftStatus('all');
  }

  function clearAllFilters() {
    setSearch('');
    setFilterRole('');
    setSort('created_at');
    setOrder('desc');
    setStatusFilter('all');
    setDraftRole('');
    setDraftSortValue('created_desc');
    setDraftStatus('all');
  }

  return (
    <>
      <NavBar />
      <div className="page-container">
        <div className="page-header">
          <h1>Gestion des comptes Sentinel</h1>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            + Ajouter un utilisateur
          </button>
        </div>

        {successMsg && (
          <div className="success-message" style={{ marginBottom: 16 }}>
            {successMsg}
          </div>
        )}

        <div className="filters-row">
          <div className="filter-group">
            <span className="filter-label">Recherche</span>
            <input
              className="form-input"
              placeholder="Nom, prénom, badge, rôle..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
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
          count={filteredUsers.length}
          countLabel="utilisateur(s) affiché(s)"
          chips={filterChips}
          onClear={clearAllFilters}
        />

        <div className="card">
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
              <span className="spinner" style={{ width: 24, height: 24, borderWidth: 3 }} />
            </div>
          ) : error ? (
            <div className="error-message" style={{ margin: 20 }}>{error}</div>
          ) : filteredUsers.length === 0 ? (
            <div className="empty-state">Aucun utilisateur trouvé.</div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Nom Prénom</th>
                    <th>Badge</th>
                    <th>Rôle</th>
                    <th>Statut</th>
                    <th>Date création</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr
                      key={user.id}
                      onClick={() => navigate(`/admin/users/${user.id}`)}
                      title="Voir la fiche"
                    >
                      <td>
                        <strong>{user.last_name}</strong> {user.first_name}
                      </td>
                      <td>{user.badge_number}</td>
                      <td>
                        <span className="badge-role">{ROLE_LABELS[user.role] || user.role}</span>
                      </td>
                      <td>
                        <span className={`badge-status ${user.is_active ? 'active' : 'inactive'}`}>
                          {user.is_active ? 'Actif' : 'Inactif'}
                        </span>
                      </td>
                      <td>{formatDate(user.created_at)}</td>
                      <td className="row-action" aria-hidden="true">
                        <svg
                          className="row-action-icon"
                          viewBox="0 0 24 24"
                          role="img"
                          aria-label="Modifier"
                        >
                          <path
                            d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41L18.37 3.29c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
                            fill="currentColor"
                          />
                        </svg>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onSuccess={(user) => {
            setShowCreate(false);
            setUsers((prev) => [user, ...prev]);
            setSuccessMsg(`Utilisateur ${user.first_name} ${user.last_name} créé avec succès.`);
            setTimeout(() => setSuccessMsg(''), 4000);
          }}
        />
      )}

      {showFilters && (
        <Modal
          title="Filtrer la liste"
          onClose={() => setShowFilters(false)}
          size="sm"
          footer={(
            <>
              <button className="btn btn-secondary" onClick={resetFilters}>
                Réinitialiser
              </button>
              <button className="btn btn-primary" onClick={applyFilters}>
                Appliquer
              </button>
            </>
          )}
        >
          <div className="form-group">
            <label className="form-label">Role</label>
            <select
              className="form-select"
              value={draftRole}
              onChange={(e) => setDraftRole(e.target.value as Role | '')}
            >
              <option value="">Tous</option>
              <option value="OPERATOR">Operateur</option>
              <option value="MAINTENANCE">Maintenance</option>
              <option value="RESPONSABLE">Responsable</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Statut</label>
            <select
              className="form-select"
              value={draftStatus}
              onChange={(e) => setDraftStatus(e.target.value as 'all' | 'active' | 'inactive')}
            >
              <option value="all">Tous</option>
              <option value="active">Actif</option>
              <option value="inactive">Inactif</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Trier par</label>
            <select
              className="form-select"
              value={draftSortValue}
              onChange={(e) => setDraftSortValue(e.target.value)}
            >
              <option value="created_desc">Plus récents</option>
              <option value="created_asc">Plus anciens</option>
              <option value="alpha_asc">Alphabétique A-Z</option>
              <option value="alpha_desc">Alphabétique Z-A</option>
            </select>
          </div>
        </Modal>
      )}
    </>
  );
}
