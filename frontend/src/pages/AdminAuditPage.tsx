import { useEffect, useMemo, useState } from 'react';
import NavBar from '../components/NavBar';
import FilterSummary, { FilterChip } from '../components/FilterSummary';
import EmptyState from '../components/ui/EmptyState';
import ErrorBanner from '../components/ui/ErrorBanner';
import SelectField from '../components/ui/SelectField';
import { listReferenceAudit } from '../api/admin';
import { ReferenceAuditEvent } from '../types';
import { formatDateTime } from '../utils/date';
import { ADMIN_EVENT_LABELS, formatAuditEventTarget } from '../utils/labels';
import { usePageTitle } from '../hooks/usePageTitle';

const TASK_GROUPS: Record<string, { label: string; events: string[] }> = {
  all: { label: 'Tous les changements', events: [] },
  creation: { label: 'Créations', events: ['USER_CREATED', 'LINE_CREATED'] },
  modification: {
    label: 'Mises à jour',
    events: ['USER_UPDATED', 'LINE_UPDATED', 'LINE_SUMMARY_UPDATED', 'LINE_MACHINE_UPDATED', 'LINE_PLAN_UPDATED'],
  },
  status: { label: 'Activations/Désactivations', events: ['USER_ACTIVATED', 'USER_DEACTIVATED'] },
  deletion: { label: 'Suppressions', events: ['USER_SOFT_DELETED', 'LINE_SOFT_DELETED'] },
  access: { label: 'Accès utilisateurs', events: ['USER_PASSWORD_RESET'] },
  system: {
    label: 'Système & sécurité',
    events: [
      'ADMIN_PASSWORD_CHANGED',
      'ADMIN_EMAIL_CHANGED',
      'ADMIN_NOTIF_UPDATED',
      'BOARD_TOGGLED',
      'BOARD_CODE_CHANGED',
      'APP_SETTINGS_CHANGED',
      'SESSIONS_REVOKED',
      'PASSWORD_RESET_REQUEST_HANDLED',
    ],
  },
};


function changesLabel(changes: Record<string, unknown> | null, eventType?: string): string {
  if (!changes) return '-';
  const keys = Object.keys(changes);
  if (keys.length === 0) return '-';

  // Événements système : on interprète les valeurs, pas juste les clés
  if (eventType === 'BOARD_TOGGLED') {
    return changes.enabled === true ? 'Board activé' : 'Board désactivé';
  }
  if (eventType === 'SESSIONS_REVOKED') {
    const scopeLabels: Record<string, string> = { admin: 'sessions admin', workshop: 'sessions atelier', board: 'sessions board' };
    return scopeLabels[String(changes.scope)] ?? 'sessions révoquées';
  }
  if (eventType === 'ADMIN_EMAIL_CHANGED') {
    if (changes.cleared) return 'Email supprimé';
    return changes.hadEmail ? 'Email modifié' : 'Email ajouté';
  }
  if (eventType === 'APP_SETTINGS_CHANGED') {
    const settingLabels: Record<string, string> = {
      session_duration_hours: 'durée session admin',
      workshop_session_hours: 'durée session atelier',
      board_session_ttl_hours: 'durée session board',
      login_max_attempts: 'tentatives max',
      setup_code_ttl_hours: 'durée code setup',
      board_label: 'nom du board',
    };
    return keys.map((k) => settingLabels[k] ?? k).join(', ');
  }
  if (eventType === 'ADMIN_NOTIF_UPDATED') {
    const notifLabels: Record<string, string> = {
      notif_admin: 'notif. admin',
      notif_responsables: 'notif. responsables',
      notif_techniciens: 'notif. techniciens',
      notif_operateurs: 'notif. opérateurs',
    };
    return keys.map((k) => {
      const label = notifLabels[k] ?? k;
      return `${label} : ${changes[k] ? 'activé' : 'désactivé'}`;
    }).join(', ');
  }

  // Événements référentiel (utilisateurs / lignes)
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
  usePageTitle("Journal d'administration");
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
  const [truncated, setTruncated] = useState(false);

  const LIMIT = 1000;

  useEffect(() => {
    const { start, end } = dateBoundary(period, customStart, customEnd);
    setLoading(true);
    setError('');
    setTruncated(false);
    listReferenceAudit({
      scope,
      taskGroup,
      q: query.trim(),
      start: start?.toISOString(),
      end: end?.toISOString(),
      order: sortOrder,
      limit: LIMIT,
    })
      .then((data) => {
        setEvents(data);
        setTruncated(data.length === LIMIT);
      })
      .catch(() => setError('Impossible de charger le journal.'))
      .finally(() => setLoading(false));
  }, [scope, taskGroup, period, customStart, customEnd, query, sortOrder]);

  const filtered = useMemo(() => {
    return events;
  }, [events]);

  const summary = useMemo(() => {
    const accountCount = filtered.filter((event) => event.scope === 'account').length;
    const lineCount = filtered.filter((event) => event.scope === 'line').length;
    const systemCount = filtered.filter((event) => event.scope === 'system').length;
    const lastEvent = filtered[0];
    return { accountCount, lineCount, systemCount, lastEvent };
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


  function toggleDateSort() {
    setSortOrder((current) => (current === 'desc' ? 'asc' : 'desc'));
  }

  function dateSortLabel(): string {
    return sortOrder === 'desc' ? 'Tri descendant' : 'Tri ascendant';
  }

  const filterChips: FilterChip[] = [
    ...(query.trim() ? [{
      key: 'search',
      label: `Recherche: ${query.trim()}`,
      onRemove: () => setQuery(''),
    }] : []),
    ...(taskGroup !== 'all' ? [{
      key: 'task',
      label: `Action: ${TASK_GROUPS[taskGroup]?.label || taskGroup}`,
      onRemove: () => setTaskGroup('all'),
    }] : []),
    ...(scope !== 'all' ? [{
      key: 'scope',
      label: `Référentiel: ${scope === 'account' ? 'Utilisateurs' : scope === 'line' ? 'Lignes' : 'Système'}`,
      onRemove: () => setScope('all'),
    }] : []),
    ...(period !== 'all' ? [{
      key: 'period',
      label: `Période: ${period === 'today' ? "Aujourd'hui" : period === '7d' ? '7 jours' : period === '30d' ? '30 jours' : 'Personnalisée'}`,
      onRemove: () => {
        setPeriod('all');
        setCustomStart('');
        setCustomEnd('');
      },
    }] : []),
    ...(sortOrder !== 'desc' ? [{
      key: 'sort',
      label: 'Plus anciennes d’abord',
      onRemove: () => setSortOrder('desc'),
    }] : []),
  ];
  const hasActiveFilters = filterChips.length > 0;

  return (
    <>
      <NavBar />
      <main id="main-content" className="page-container">
        <div className="page-header">
          <h1>Journal d'administration</h1>
        </div>

        <div className="audit-context">
          <span className="audit-context-text">Traçabilité complète des actions administratives.</span>
          <span className="audit-context-stats" aria-label="Résumé du journal">
            <span className="audit-context-stat">
              <span>résultats</span>
              <strong>{filtered.length}</strong>
            </span>
            <span className="audit-context-stat">
              <span>utilisateurs</span>
              <strong>{summary.accountCount}</strong>
            </span>
            <span className="audit-context-stat">
              <span>lignes</span>
              <strong>{summary.lineCount}</strong>
            </span>
            <span className="audit-context-stat">
              <span>système</span>
              <strong>{summary.systemCount}</strong>
            </span>
          </span>
        </div>

        <div className="audit-filter-panel">
          <div className="audit-filter-main">
            <div className="filter-group audit-search">
              <label className="filter-label" htmlFor="audit-search">Recherche</label>
              <input
                id="audit-search"
                className="form-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cible, badge, ligne, champ..."
              />
            </div>
            <div className="filter-group">
              <span className="filter-label" aria-hidden="true">Type d'action</span>
              <SelectField
                value={taskGroup}
                onChange={setTaskGroup}
                ariaLabel="Type d'action"
                options={Object.entries(TASK_GROUPS).map(([value, group]) => ({ value, label: group.label }))}
              />
            </div>
            <div className="filter-group">
              <span className="filter-label" aria-hidden="true">Référentiel</span>
              <SelectField
                value={scope}
                onChange={setScope}
                ariaLabel="Référentiel"
                options={[
                  { value: 'all', label: 'Tout' },
                  { value: 'account', label: 'Utilisateurs' },
                  { value: 'line', label: 'Lignes' },
                  { value: 'system', label: 'Système' },
                ]}
              />
            </div>
          </div>
          <div className="audit-filter-secondary">
            <div className="filter-group">
              <span className="filter-label" aria-hidden="true">Période</span>
              <SelectField
                value={period}
                onChange={setPeriod}
                ariaLabel="Période"
                options={[
                  { value: 'today', label: "Aujourd'hui" },
                  { value: '7d', label: '7 derniers jours' },
                  { value: '30d', label: '30 derniers jours' },
                  { value: 'all', label: "Tout l'historique" },
                  { value: 'custom', label: 'Personnalisée' },
                ]}
              />
            </div>
            {period === 'custom' && (
              <>
                <div className="filter-group">
                  <label className="filter-label" htmlFor="audit-date-start">Début</label>
                  <input id="audit-date-start" className="form-input" type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} />
                </div>
                <div className="filter-group">
                  <label className="filter-label" htmlFor="audit-date-end">Fin</label>
                  <input id="audit-date-end" className="form-input" type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} />
                </div>
              </>
            )}
            <button className="btn btn-secondary audit-clear-btn" type="button" onClick={resetFilters} disabled={!hasActiveFilters}>
              Effacer les filtres
            </button>
          </div>
          <FilterSummary
            count={filtered.length}
            countLabel="événement(s) affiché(s)"
            chips={filterChips}
            emptyText="Journal complet"
            className="filter-summary-embedded"
          />
        </div>

        {truncated && (
          <div className="notice" style={{ marginBottom: 12 }}>
            Seuls les {LIMIT} événements les plus récents sont affichés. Affinez les filtres pour voir des résultats plus anciens.
          </div>
        )}

        <div className="card user-list-panel">
          {loading ? (
            <EmptyState>Chargement...</EmptyState>
          ) : error ? (
            <ErrorBanner style={{ margin: 20 }}>{error}</ErrorBanner>
          ) : filtered.length === 0 ? (
            <EmptyState>Aucun événement trouvé.</EmptyState>
          ) : (
            <>
              <div className="table-wrapper audit-table-wrapper">
                <table style={{ tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: '16%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '20%' }} />
                    <col style={{ width: '20%' }} />
                    <col />
                  </colgroup>
                  <thead>
                    <tr>
                      <th scope="col" aria-sort={sortOrder === 'desc' ? 'descending' : 'ascending'}>
                        <button className="table-sort-button" type="button" onClick={toggleDateSort}>
                          Date
                          <span className="sr-only">{dateSortLabel()}</span>
                        </button>
                      </th>
                      <th scope="col">Référentiel</th>
                      <th scope="col">Action</th>
                      <th scope="col">Cible</th>
                      <th scope="col">Champs modifiés</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((event) => (
                      <tr key={`${event.scope}-${event.id}`} style={{ cursor: 'default' }}>
                        <td>{formatDateTime(event.created_at)}</td>
                        <td>{event.scope === 'line' ? 'Ligne' : event.scope === 'system' ? 'Système' : 'Utilisateur'}</td>
                        <td>{ADMIN_EVENT_LABELS[event.event_type] || event.event_type}</td>
                        <td>{formatAuditEventTarget(event, true)}</td>
                        <td>{changesLabel(event.changes, event.event_type)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="audit-card-list">
                {filtered.map((event) => (
                  <div className="user-card-row" key={`${event.scope}-${event.id}`} style={{ cursor: 'default' }}>
                    <span className="user-card-main">
                      <span className="user-card-name">
                        {ADMIN_EVENT_LABELS[event.event_type] || event.event_type}
                      </span>
                      <span className="user-card-badge">{formatAuditEventTarget(event, true)}</span>
                    </span>
                    <span className="user-card-meta">
                      <span className="badge-role">{event.scope === 'line' ? 'Ligne' : event.scope === 'system' ? 'Système' : 'Utilisateur'}</span>
                      {changesLabel(event.changes, event.event_type) !== '-' && (
                        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                          {changesLabel(event.changes, event.event_type)}
                        </span>
                      )}
                    </span>
                    <span className="user-card-footer">
                      <span>{formatDateTime(event.created_at)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}
