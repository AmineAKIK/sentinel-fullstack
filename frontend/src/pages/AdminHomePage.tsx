import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import NavBar from '../components/NavBar';
import EmptyState from '../components/ui/EmptyState';
import ErrorBanner from '../components/ui/ErrorBanner';
import KpiCard from '../components/ui/KpiCard';
import PendingTasksWidget from '../components/PendingTasksWidget';
import {
  getReferenceDashboard,
  getReferenceQuality,
  listPendingPasswordResetRequests,
  PasswordResetRequest,
} from '../api/admin';
import { ReferenceDashboard, ReferenceQuality } from '../types';
import { formatDateTime } from '../utils/date';
import { formatAdminEventLabel, formatAuditEventTarget } from '../utils/labels';
import { usePageTitle } from '../hooks/usePageTitle';
import { inflect } from '../utils/french';

export default function AdminHomePage() {
  usePageTitle('Accueil administration');
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<ReferenceDashboard | null>(null);
  const [quality, setQuality] = useState<ReferenceQuality | null>(null);
  const [pendingRequests, setPendingRequests] = useState<PasswordResetRequest[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    void Promise.all([
      getReferenceDashboard(signal),
      getReferenceQuality(signal),
      listPendingPasswordResetRequests(signal),
    ])
      .then(([dashboardData, qualityData, requestsData]) => {
        if (signal.aborted) return;
        setDashboard(dashboardData);
        setQuality(qualityData);
        setPendingRequests(requestsData);
      })
      .catch(() => {
        if (!signal.aborted) setError("Impossible de charger l'accueil administration.");
      });
    return () => controller.abort();
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
          <KpiCard
            label="Utilisateurs actifs"
            value={dashboard?.users_active ?? '-'}
            sub={`${dashboard?.users_inactive ?? '-'} inactifs`}
          />
          <KpiCard
            label="Sans mot de passe"
            value={dashboard?.users_without_password ?? '-'}
            sub="Comptes à finaliser"
          />
          <KpiCard
            label="Lignes actives"
            value={dashboard?.lines_active ?? '-'}
            sub={`${dashboard?.machines_total ?? '-'} machines référencées`}
          />
          <KpiCard
            label="Points à vérifier"
            value={quality ? qualityCount : '-'}
            sub="Qualité des référentiels"
          />
        </div>

        <div className="admin-overview-grid">
          <PendingTasksWidget
            requests={pendingRequests}
            onHandled={(id) => setPendingRequests((prev) => prev.filter((r) => r.id !== id))}
          />

          <section className="card admin-quality-card">
            <div className="card-body">
              <div className="admin-section-header">
                <div>
                  <h2>Contrôle qualité</h2>
                  <span>Points à traiter dans les référentiels</span>
                </div>
                <strong
                  className={qualityCount > 0 ? 'admin-status-badge warning' : 'admin-status-badge'}
                >
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
                      <span>
                        {inflect(
                          quality.users_without_password.length,
                          'utilisateur actif sans mot de passe',
                          'utilisateurs actifs sans mot de passe'
                        )}
                      </span>
                    </button>
                  )}
                  {quality.inactive_users.length > 0 && (
                    <button className="quality-item" onClick={() => navigate('/admin/users')}>
                      <strong>{quality.inactive_users.length}</strong>
                      <span>
                        {inflect(
                          quality.inactive_users.length,
                          'utilisateur inactif',
                          'utilisateurs inactifs'
                        )}
                      </span>
                    </button>
                  )}
                  {quality.inactive_lines.length > 0 && (
                    <button className="quality-item" onClick={() => navigate('/admin/lines')}>
                      <strong>{quality.inactive_lines.length}</strong>
                      <span>
                        {inflect(
                          quality.inactive_lines.length,
                          'ligne inactive',
                          'lignes inactives'
                        )}
                      </span>
                    </button>
                  )}
                  {quality.malformed_machines.length > 0 && (
                    <button className="quality-item" onClick={() => navigate('/admin/lines')}>
                      <strong>{quality.malformed_machines.length}</strong>
                      <span>
                        {inflect(
                          quality.malformed_machines.length,
                          'machine à compléter',
                          'machines à compléter'
                        )}
                      </span>
                    </button>
                  )}
                  {quality.duplicate_machines.length > 0 && (
                    <button className="quality-item" onClick={() => navigate('/admin/lines')}>
                      <strong>{quality.duplicate_machines.length}</strong>
                      <span>
                        {inflect(
                          quality.duplicate_machines.length,
                          'machine en doublon',
                          'machines en doublon'
                        )}
                      </span>
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
                        <strong>{formatAdminEventLabel(event.event_type)}</strong>
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
