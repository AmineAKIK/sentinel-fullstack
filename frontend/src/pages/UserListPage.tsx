import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import NavBar from '../components/NavBar';
import CreateUserModal from '../components/CreateUserModal';
import Modal from '../components/Modal';
import FilterSummary, { FilterChip } from '../components/FilterSummary';
import EmptyState from '../components/ui/EmptyState';
import ErrorBanner from '../components/ui/ErrorBanner';
import SelectField from '../components/ui/SelectField';
import Spinner from '../components/ui/Spinner';
import { listAccounts } from '../api/accounts';
import { SentinelUser, Role, SortOrder } from '../types';
import { formatDate } from '../utils/date';
import { ROLE_LABELS } from '../utils/labels';

type UserSortField = 'name' | 'badge' | 'role' | 'status' | 'created_at';

export default function UserListPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<SentinelUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const [filterRole, setFilterRole] = useState<Role | ''>('');
  const [sort, setSort] = useState<UserSortField>('created_at');
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
      const data = await listAccounts({ role: filterRole });
      setUsers(data);
    } catch {
      setError('Impossible de charger la liste des utilisateurs.');
    } finally {
      setLoading(false);
    }
  }, [filterRole]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  function handleSortChange(value: string) {
    if (value === 'alpha_asc') { setSort('name'); setOrder('asc'); }
    else if (value === 'alpha_desc') { setSort('name'); setOrder('desc'); }
    else if (value === 'badge_asc') { setSort('badge'); setOrder('asc'); }
    else if (value === 'badge_desc') { setSort('badge'); setOrder('desc'); }
    else if (value === 'role_asc') { setSort('role'); setOrder('asc'); }
    else if (value === 'role_desc') { setSort('role'); setOrder('desc'); }
    else if (value === 'status_asc') { setSort('status'); setOrder('asc'); }
    else if (value === 'status_desc') { setSort('status'); setOrder('desc'); }
    else if (value === 'created_asc') { setSort('created_at'); setOrder('asc'); }
    else { setSort('created_at'); setOrder('desc'); }
  }

  function getSortValue(): string {
    if (sort === 'name' && order === 'asc') return 'alpha_asc';
    if (sort === 'name' && order === 'desc') return 'alpha_desc';
    if (sort === 'badge' && order === 'asc') return 'badge_asc';
    if (sort === 'badge' && order === 'desc') return 'badge_desc';
    if (sort === 'role' && order === 'asc') return 'role_asc';
    if (sort === 'role' && order === 'desc') return 'role_desc';
    if (sort === 'status' && order === 'asc') return 'status_asc';
    if (sort === 'status' && order === 'desc') return 'status_desc';
    if (sort === 'created_at' && order === 'asc') return 'created_asc';
    return 'created_desc';
  }

  const filteredUsers = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const visibleUsers = users.filter((user) => {
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

    return [...visibleUsers].sort((a, b) => compareUsers(a, b, sort, order));
  }, [users, search, statusFilter, sort, order]);

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
      label: `Tri: ${sortFieldLabel(sort)} ${order === 'asc' ? 'asc.' : 'desc.'}`,
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

  function toggleTableSort(field: UserSortField) {
    if (sort === field) {
      setOrder((current) => current === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSort(field);
    setOrder(field === 'created_at' ? 'desc' : 'asc');
  }

  function headerSortLabel(field: UserSortField): string {
    if (sort !== field) return 'Trier';
    return order === 'asc' ? 'Tri ascendant' : 'Tri descendant';
  }

  function headerSortIndicator(field: UserSortField): string {
    if (sort !== field) return '↕';
    return order === 'asc' ? '↑' : '↓';
  }

  function headerAriaSort(field: UserSortField): 'ascending' | 'descending' | 'none' {
    if (sort !== field) return 'none';
    return order === 'asc' ? 'ascending' : 'descending';
  }

  return (
    <>
      <NavBar />
      <div className="page-container">
        <div className="page-header">
          <h1>Gestion des comptes</h1>
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

        <div className="card user-list-panel">
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
              <Spinner size={24} borderWidth={3} />
            </div>
          ) : error ? (
            <ErrorBanner style={{ margin: 20 }}>{error}</ErrorBanner>
          ) : filteredUsers.length === 0 ? (
            <EmptyState>Aucun utilisateur trouvé.</EmptyState>
          ) : (
            <>
            <div className="table-wrapper user-table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th aria-sort={headerAriaSort('name')}>
                      <button className="table-sort-button" type="button" onClick={() => toggleTableSort('name')}>
                        Nom Prénom
                        <span className="sr-only">{headerSortLabel('name')}</span>
                      </button>
                    </th>
                    <th>Badge</th>
                    <th>Rôle</th>
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
                  {filteredUsers.map((user) => (
                    <tr
                      key={user.id}
                      onClick={() => navigate(`/admin/users/${user.id}`)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          navigate(`/admin/users/${user.id}`);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-label={`Voir la fiche utilisateur ${user.first_name} ${user.last_name}`}
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
            <div className="user-card-list">
              {filteredUsers.map((user) => (
                <button
                  className="user-card-row"
                  key={user.id}
                  type="button"
                  onClick={() => navigate(`/admin/users/${user.id}`)}
                  aria-label={`Voir la fiche utilisateur ${user.first_name} ${user.last_name}`}
                >
                  <span className="user-card-main">
                    <span className="user-card-name">
                      <strong>{user.last_name}</strong> {user.first_name}
                    </span>
                    <span className="user-card-badge">Badge {user.badge_number}</span>
                  </span>
                  <span className="user-card-meta">
                    <span className="badge-role">{ROLE_LABELS[user.role] || user.role}</span>
                    <span className={`badge-status ${user.is_active ? 'active' : 'inactive'}`}>
                      {user.is_active ? 'Actif' : 'Inactif'}
                    </span>
                  </span>
                  <span className="user-card-footer">
                    <span>{formatDate(user.created_at)}</span>
                  </span>
                </button>
              ))}
            </div>
            </>
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
            <SelectField
              value={draftRole}
              onChange={(value) => setDraftRole(value as Role | '')}
              options={[
                { value: '', label: 'Tous' },
                ...Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label })),
              ]}
            />
          </div>
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
                { value: 'created_desc', label: 'Plus récents' },
                { value: 'created_asc', label: 'Plus anciens' },
                { value: 'alpha_asc', label: 'Alphabétique A-Z' },
                { value: 'alpha_desc', label: 'Alphabétique Z-A' },
                { value: 'status_asc', label: "Actifs d'abord" },
                { value: 'status_desc', label: "Inactifs d'abord" },
              ]}
            />
          </div>
        </Modal>
      )}
    </>
  );
}

function compareUsers(a: SentinelUser, b: SentinelUser, field: UserSortField, order: SortOrder): number {
  const direction = order === 'asc' ? 1 : -1;
  let result = 0;

  if (field === 'name') {
    result = userName(a).localeCompare(userName(b), 'fr', { sensitivity: 'base' });
  } else if (field === 'badge') {
    result = a.badge_number.localeCompare(b.badge_number, 'fr', { numeric: true, sensitivity: 'base' });
  } else if (field === 'role') {
    result = (ROLE_LABELS[a.role] || a.role).localeCompare(ROLE_LABELS[b.role] || b.role, 'fr', { sensitivity: 'base' });
  } else if (field === 'status') {
    result = Number(b.is_active) - Number(a.is_active);
  } else {
    result = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  }

  if (result === 0) {
    result = userName(a).localeCompare(userName(b), 'fr', { sensitivity: 'base' });
  }
  return result * direction;
}

function userName(user: SentinelUser): string {
  return `${user.last_name} ${user.first_name}`.trim();
}

function sortFieldLabel(field: UserSortField): string {
  if (field === 'name') return 'nom';
  if (field === 'badge') return 'badge';
  if (field === 'role') return 'rôle';
  if (field === 'status') return 'statut';
  return 'date';
}
