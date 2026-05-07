import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import NavBar from '../components/NavBar';
import { getReferenceDashboard, getReferenceQuality } from '../api/admin';
import { ReferenceDashboard, ReferenceQuality } from '../types';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function eventTarget(event: ReferenceDashboard['recent_events'][number]): string {
  if (event.scope === 'line') return event.line_number || 'Ligne supprimée';
  return `${event.first_name || ''} ${event.last_name || ''}`.trim() || event.badge_number || 'Utilisateur';
}

const EVENT_LABELS: Record<string, string> = {
  USER_CREATED: 'Utilisateur créé',
  USER_UPDATED: 'Utilisateur modifié',
  USER_ACTIVATED: 'Utilisateur activé',
  USER_DEACTIVATED: 'Utilisateur désactivé',
  USER_SOFT_DELETED: 'Utilisateur supprimé',
  USER_PASSWORD_RESET: 'Mot de passe utilisateur réinitialisé',
  LINE_CREATED: 'Ligne créée',
  LINE_UPDATED: 'Ligne mise à jour',
  LINE_SUMMARY_UPDATED: 'Informations ligne modifiées',
  LINE_MACHINE_UPDATED: 'Machine modifiée',
  LINE_PLAN_UPDATED: 'Ordre machines modifié',
  LINE_SOFT_DELETED: 'Ligne supprimée',
};

export default function AdminHomePage() {
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

  return (
    <>
      <NavBar />
      <main className="page-container admin-home">
        <div className="page-header">
          <h1>Accueil administration</h1>
        </div>

        {error && <div className="error-message" style={{ marginBottom: 16 }}>{error}</div>}

        <div className="kpi-grid">
          <div className="card kpi-card">
            <span className="kpi-label">Utilisateurs actifs</span>
            <strong className="kpi-value">{dashboard?.users_active ?? '-'}</strong>
            <span className="kpi-sub">{dashboard?.users_inactive ?? '-'} inactifs</span>
          </div>
          <div className="card kpi-card">
            <span className="kpi-label">Sans mot de passe</span>
            <strong className="kpi-value">{dashboard?.users_without_password ?? '-'}</strong>
            <span className="kpi-sub">Comptes à finaliser</span>
          </div>
          <div className="card kpi-card">
            <span className="kpi-label">Lignes actives</span>
            <strong className="kpi-value">{dashboard?.lines_active ?? '-'}</strong>
            <span className="kpi-sub">{dashboard?.machines_total ?? '-'} machines référencées</span>
          </div>
          <div className="card kpi-card">
            <span className="kpi-label">Points à vérifier</span>
            <strong className="kpi-value">{quality ? qualityCount : '-'}</strong>
            <span className="kpi-sub">Qualité des référentiels</span>
          </div>
        </div>

        <div className="admin-home-grid">
          <button className="admin-tile" onClick={() => navigate('/admin/users')}>
            <span className="admin-tile-title">Utilisateurs</span>
            <span className="admin-tile-text">Gérer les comptes Sentinel et leurs statuts.</span>
          </button>

          <button className="admin-tile" onClick={() => navigate('/admin/lines')}>
            <span className="admin-tile-title">Lignes</span>
            <span className="admin-tile-text">Accéder à la gestion des lignes.</span>
          </button>
        </div>

        <div className="admin-dashboard-grid">
          <section className="card">
            <div className="card-body">
              <h2 style={{ marginBottom: 12 }}>Contrôle qualité</h2>
              {!quality ? (
                <div className="empty-state" style={{ padding: 24 }}>Chargement...</div>
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

          <section className="card">
            <div className="card-body">
              <h2 style={{ marginBottom: 12 }}>Derniers changements</h2>
              {!dashboard ? (
                <div className="empty-state" style={{ padding: 24 }}>Chargement...</div>
              ) : dashboard.recent_events.length === 0 ? (
                <div className="empty-state" style={{ padding: 24 }}>Aucun changement tracé.</div>
              ) : (
                <div className="audit-list">
                  {dashboard.recent_events.map((event) => (
                    <div className="audit-item" key={`${event.scope}-${event.id}`}>
                      <strong>{EVENT_LABELS[event.event_type] || event.event_type}</strong>
                      <span>{eventTarget(event)}</span>
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
