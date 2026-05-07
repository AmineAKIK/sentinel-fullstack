import { useEffect, useMemo, useState } from 'react';
import NavBar from '../components/NavBar';
import { listReferenceAudit } from '../api/admin';
import { ReferenceAuditEvent } from '../types';

const EVENT_LABELS: Record<string, string> = {
  USER_CREATED: 'Utilisateur créé',
  USER_UPDATED: 'Utilisateur modifié',
  USER_ACTIVATED: 'Utilisateur activé',
  USER_DEACTIVATED: 'Utilisateur désactivé',
  USER_SOFT_DELETED: 'Utilisateur supprimé',
  USER_PASSWORD_RESET: 'Mot de passe réinitialisé',
  LINE_CREATED: 'Ligne créée',
  LINE_UPDATED: 'Ligne mise à jour',
  LINE_SUMMARY_UPDATED: 'Informations ligne modifiées',
  LINE_MACHINE_UPDATED: 'Machine modifiée',
  LINE_PLAN_UPDATED: 'Ordre machines modifié',
  LINE_SOFT_DELETED: 'Ligne supprimée',
};

const TASK_GROUPS: Record<string, { label: string; events: string[] }> = {
  all: { label: 'Tous les changements', events: [] },
  creation: { label: 'Créations', events: ['USER_CREATED', 'LINE_CREATED'] },
  modification: {
    label: 'Mises à jour',
    events: ['USER_UPDATED', 'LINE_UPDATED', 'LINE_SUMMARY_UPDATED', 'LINE_MACHINE_UPDATED', 'LINE_PLAN_UPDATED'],
  },
  status: { label: 'Activations', events: ['USER_ACTIVATED', 'USER_DEACTIVATED'] },
  deletion: { label: 'Suppressions', events: ['USER_SOFT_DELETED', 'LINE_SOFT_DELETED'] },
  access: { label: 'Accès utilisateurs', events: ['USER_PASSWORD_RESET'] },
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function targetLabel(event: ReferenceAuditEvent): string {
  if (event.scope === 'line') return event.line_number || 'Ligne supprimée';
  const name = `${event.first_name || ''} ${event.last_name || ''}`.trim();
  return event.badge_number ? `${name || 'Utilisateur'} (${event.badge_number})` : name || 'Utilisateur';
}

function changesLabel(changes: Record<string, unknown> | null): string {
  if (!changes) return '-';
  const keys = Object.keys(changes);
  if (keys.length === 0) return '-';
  const labels: Record<string, string> = {
    firstName: 'prénom',
    lastName: 'nom',
    badgeNumber: 'badge',
    role: 'rôle',
    lineNumber: 'numéro de ligne',
    machines: 'machines',
    machinesCount: 'machines',
    isActive: 'statut',
  };
  return keys.map((key) => labels[key] || key).join(', ');
}

function dateBoundary(period: string, customStart: string, customEnd: string) {
  const now = new Date();
  let start: Date | null = null;
  let end: Date | null = null;

  if (period === 'today') {
    start = new Date(now);
    start.setHours(0, 0, 0, 0);
  } else if (period === '7d') {
    start = new Date(now);
    start.setDate(now.getDate() - 7);
  } else if (period === '30d') {
    start = new Date(now);
    start.setDate(now.getDate() - 30);
  } else if (period === 'custom') {
    if (customStart) {
      start = new Date(customStart);
      start.setHours(0, 0, 0, 0);
    }
    if (customEnd) {
      end = new Date(customEnd);
      end.setHours(23, 59, 59, 999);
    }
  }

  return { start, end };
}

export default function AdminAuditPage() {
  const [scope, setScope] = useState('all');
  const [taskGroup, setTaskGroup] = useState('all');
  const [period, setPeriod] = useState('all');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [events, setEvents] = useState<ReferenceAuditEvent[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    listReferenceAudit(scope)
      .then(setEvents)
      .catch(() => setError('Impossible de charger le journal.'))
      .finally(() => setLoading(false));
  }, [scope]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const allowedTasks = TASK_GROUPS[taskGroup]?.events || [];
    const { start, end } = dateBoundary(period, customStart, customEnd);

    const result = events.filter((event) => {
      if (allowedTasks.length > 0 && !allowedTasks.includes(event.event_type)) return false;
      const createdAt = new Date(event.created_at);
      if (start && createdAt < start) return false;
      if (end && createdAt > end) return false;
      if (!needle) return true;
      const haystack = [
        EVENT_LABELS[event.event_type] || event.event_type,
        targetLabel(event),
        event.scope,
        changesLabel(event.changes),
      ].join(' ').toLowerCase();
      return haystack.includes(needle);
    });

    return result.sort((a, b) => {
      const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return sortOrder === 'asc' ? diff : -diff;
    });
  }, [events, query, taskGroup, period, customStart, customEnd, sortOrder]);

  const summary = useMemo(() => {
    const accountCount = filtered.filter((event) => event.scope === 'account').length;
    const lineCount = filtered.filter((event) => event.scope === 'line').length;
    const lastEvent = filtered[0];
    return { accountCount, lineCount, lastEvent };
  }, [filtered]);

  function resetFilters() {
    setScope('all');
    setTaskGroup('all');
    setPeriod('all');
    setSortOrder('desc');
    setCustomStart('');
    setCustomEnd('');
    setQuery('');
  }

  return (
    <>
      <NavBar />
      <main className="page-container">
        <div className="page-header">
          <h1>Journal d'administration</h1>
        </div>

        <div className="audit-context">
          <span>Journal des changements administratifs sur les utilisateurs et les lignes.</span>
          <strong>{filtered.length}</strong>
          <span>résultat(s)</span>
          <span className="audit-context-divider" />
          <span>{summary.accountCount} utilisateur(s)</span>
          <span>{summary.lineCount} ligne(s)</span>
        </div>

        <div className="audit-filter-panel">
          <div className="audit-filter-main">
            <div className="filter-group audit-search">
              <span className="filter-label">Recherche</span>
              <input
                className="form-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cible, badge, ligne, champ..."
              />
            </div>
            <div className="filter-group">
              <span className="filter-label">Type d'action</span>
              <select
                className="form-select"
                value={taskGroup}
                onChange={(event) => setTaskGroup(event.target.value)}
              >
                {Object.entries(TASK_GROUPS).map(([value, group]) => (
                  <option key={value} value={value}>{group.label}</option>
                ))}
              </select>
            </div>
            <div className="filter-group">
              <span className="filter-label">Référentiel</span>
              <select className="form-select" value={scope} onChange={(event) => setScope(event.target.value)}>
                <option value="all">Tout</option>
                <option value="account">Utilisateurs</option>
                <option value="line">Lignes</option>
              </select>
            </div>
          </div>
          <div className="audit-filter-secondary">
            <div className="filter-group">
              <span className="filter-label">Période</span>
              <select className="form-select" value={period} onChange={(event) => setPeriod(event.target.value)}>
                <option value="today">Aujourd'hui</option>
                <option value="7d">7 derniers jours</option>
                <option value="30d">30 derniers jours</option>
                <option value="all">Tout l'historique</option>
                <option value="custom">Personnalisée</option>
              </select>
            </div>
            {period === 'custom' && (
              <>
                <div className="filter-group">
                  <span className="filter-label">Début</span>
                  <input className="form-input" type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} />
                </div>
                <div className="filter-group">
                  <span className="filter-label">Fin</span>
                  <input className="form-input" type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} />
                </div>
              </>
            )}
            <div className="filter-group">
              <span className="filter-label">Tri</span>
              <select className="form-select" value={sortOrder} onChange={(event) => setSortOrder(event.target.value as 'desc' | 'asc')}>
                <option value="desc">Plus récentes d'abord</option>
                <option value="asc">Plus anciennes d'abord</option>
              </select>
            </div>
            <button className="btn btn-secondary audit-clear-btn" type="button" onClick={resetFilters}>
              Effacer les filtres
            </button>
          </div>
        </div>

        <div className="card">
          {loading ? (
            <div className="empty-state">Chargement...</div>
          ) : error ? (
            <div className="error-message" style={{ margin: 20 }}>{error}</div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">Aucun événement trouvé.</div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Référentiel</th>
                    <th>Action</th>
                    <th>Cible</th>
                    <th>Champs modifiés</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((event) => (
                    <tr key={`${event.scope}-${event.id}`}>
                      <td>{formatDateTime(event.created_at)}</td>
                      <td>{event.scope === 'line' ? 'Ligne' : 'Utilisateur'}</td>
                      <td>{EVENT_LABELS[event.event_type] || event.event_type}</td>
                      <td>{targetLabel(event)}</td>
                      <td>{changesLabel(event.changes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
