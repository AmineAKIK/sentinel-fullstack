import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import NavBar from '../components/NavBar';
import EmptyState from '../components/ui/EmptyState';
import ErrorBanner from '../components/ui/ErrorBanner';
import KpiCard from '../components/ui/KpiCard';
import { getReferenceDashboard, getReferenceQuality } from '../api/admin';
import { ReferenceDashboard, ReferenceQuality } from '../types';
import { formatDateTime } from '../utils/date';
import { ADMIN_EVENT_LABELS, formatAuditEventTarget } from '../utils/labels';
import { usePageTitle } from '../hooks/usePageTitle';

export default function AdminHomePage() {
  usePageTitle('Accueil administration');
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<ReferenceDashboard | null>(null);
  const [quality, setQuality] = useState<ReferenceQuality | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([getReferenceDashboard(), getReferenceQuality()])
      .then(([dashboardData, qualityData]) => {
        setDashboard(dashboardData);
        setQuality(qualityData);
      })
      .catch(() => setError("Impossible de charger l'accueil administration."));
  }, []);

  const qualityCount = quality
    ? quality.users_without_password.length +
      quality.inactive_users.length +
      quality.inactive_lines.length +
      quality.malformed_machines.length +
      quality.duplicate_machines.length
    : 0;
  const recentEvents = dashboard?.recent_events.slice(0, 5) ?? [];

  return (
    <>
      <NavBar />
      <main id="main-content" className="page-container admin-home">
        <div className="page-header">
          <h1>Accueil administration</h1>
        </div>

        {error && <ErrorBanner style={{ marginBottom: 16 }}>{error}</ErrorBanner>}

        <div className="kpi-grid kpi-grid--4">
          <KpiCard label="Utilisateurs actifs" value={dashboard?.users_active ?? '-'} sub={`${dashboard?.users_inactive ?? '-'} inactifs`} />
          <KpiCard label="Sans mot de passe" value={dashboard?.users_without_password ?? '-'} sub="Comptes à finaliser" />
          <KpiCard label="Lignes actives" value={dashboard?.lines_active ?? '-'} sub={`${dashboard?.machines_total ?? '-'} machines référencées`} />
          <KpiCard label="Points à vérifier" value={quality ? qualityCount : '-'} sub="Qualité des référentiels" />
        </div>

        <div className="admin-overview-grid">
          <section className="card admin-action-card">
            <div className="card-body">
              <div className="admin-section-header">
                <div>
                  <h2>Accès rapides</h2>
                  <span>Référentiels opérationnels</span>
                </div>
              </div>

              <div className="admin-action-list">
                <button className="admin-action-row" onClick={() => navigate('/admin/users')}>
                  <span>
                    <strong>Utilisateurs</strong>
                    <small>{dashboard ? `${dashboard.users_total} compte(s), ${dashboard.users_active} actif(s)` : 'Chargement...'}</small>
                  </span>
                </button>

                <button className="admin-action-row" onClick={() => navigate('/admin/lines')}>
                  <span>
                    <strong>Lignes</strong>
                    <small>{dashboard ? `${dashboard.lines_total} ligne(s), ${dashboard.machines_total} machine(s)` : 'Chargement...'}</small>
                  </span>
                </button>
              </div>
            </div>
          </section>

          <section className="card admin-quality-card">
            <div className="card-body">
              <div className="admin-section-header">
                <div>
                  <h2>Contrôle qualité</h2>
                  <span>Points à traiter dans les référentiels</span>
                </div>
                <strong className={qualityCount > 0 ? 'admin-status-badge warning' : 'admin-status-badge'}>
                  {quality ? qualityCount : '-'}
                </strong>
              </div>

              {!quality ? (
                <EmptyState style={{ padding: 24 }}>Chargement...</EmptyState>
              ) : qualityCount === 0 ? (
                <div className="notice">Aucun point bloquant détecté dans les référentiels.</div>
              ) : (
                <div className="quality-list">
                  {quality.users_without_password.length > 0 && (
                    <button className="quality-item" onClick={() => navigate('/admin/users')}>
                      <strong>{quality.users_without_password.length}</strong>
                      <span>utilisateur(s) actif(s) sans mot de passe</span>
                    </button>
                  )}
                  {quality.inactive_users.length > 0 && (
                    <button className="quality-item" onClick={() => navigate('/admin/users')}>
                      <strong>{quality.inactive_users.length}</strong>
                      <span>utilisateur(s) inactif(s)</span>
                    </button>
                  )}
                  {quality.inactive_lines.length > 0 && (
                    <button className="quality-item" onClick={() => navigate('/admin/lines')}>
                      <strong>{quality.inactive_lines.length}</strong>
                      <span>ligne(s) inactive(s)</span>
                    </button>
                  )}
                  {quality.malformed_machines.length > 0 && (
                    <button className="quality-item" onClick={() => navigate('/admin/lines')}>
                      <strong>{quality.malformed_machines.length}</strong>
                      <span>machine(s) à compléter</span>
                    </button>
                  )}
                  {quality.duplicate_machines.length > 0 && (
                    <button className="quality-item" onClick={() => navigate('/admin/lines')}>
                      <strong>{quality.duplicate_machines.length}</strong>
                      <span>machine(s) en doublon</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>

          <section className="card admin-activity-card">
            <div className="card-body">
              <div className="admin-section-header">
                <div>
                  <h2>Derniers changements</h2>
                  <span>Aperçu du journal d'administration</span>
                </div>
                <button className="admin-header-link" onClick={() => navigate('/admin/audit')}>
                  Journal
                </button>
              </div>

              {!dashboard ? (
                <EmptyState style={{ padding: 24 }}>Chargement...</EmptyState>
              ) : dashboard.recent_events.length === 0 ? (
                <EmptyState style={{ padding: 24 }}>Aucun changement tracé.</EmptyState>
              ) : (
                <div className="audit-list admin-activity-list">
                  {recentEvents.map((event) => (
                    <div className="audit-item" key={`${event.scope}-${event.id}`}>
                      <div>
                        <strong>{ADMIN_EVENT_LABELS[event.event_type] || event.event_type}</strong>
                        <span>{formatAuditEventTarget(event)}</span>
                      </div>
                      <small>{formatDateTime(event.created_at)}</small>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
