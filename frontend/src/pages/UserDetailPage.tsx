import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import NavBar from '../components/NavBar';
import EditUserModal from '../components/EditUserModal';
import DeleteConfirmModal from '../components/DeleteConfirmModal';
import DetailField from '../components/ui/DetailField';
import ErrorBanner from '../components/ui/ErrorBanner';
import SuccessBanner from '../components/ui/SuccessBanner';
import FullPageLoader from '../components/ui/FullPageLoader';
import { getAccount } from '../api/accounts';
import { SentinelUser } from '../types';
import { formatDateTime } from '../utils/date';
import { formatRoleLabel } from '../utils/labels';
import { usePageTitle } from '../hooks/usePageTitle';

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<SentinelUser | null>(null);
  usePageTitle(user ? `${user.first_name} ${user.last_name}` : 'Fiche utilisateur');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const successTimerRef = useRef<number | null>(null);

  const [modal, setModal] = useState<'edit' | 'delete' | null>(null);

  useEffect(() => {
    const numId = parseInt(id || '', 10);
    if (isNaN(numId)) {
      navigate('/admin/users', { replace: true });
      return undefined;
    }

    const controller = new AbortController();
    setLoading(true);
    setError('');
    void getAccount(numId, controller.signal)
      .then(setUser)
      .catch(() => {
        if (!controller.signal.aborted) {
          setError('Utilisateur introuvable ou accès refusé.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id, navigate]);

  useEffect(
    () => () => {
      if (successTimerRef.current !== null) window.clearTimeout(successTimerRef.current);
    },
    []
  );

  function showSuccess(msg: string) {
    if (successTimerRef.current !== null) window.clearTimeout(successTimerRef.current);
    setSuccessMsg(msg);
    successTimerRef.current = window.setTimeout(() => {
      setSuccessMsg('');
      successTimerRef.current = null;
    }, 5000);
  }

  function passwordStatusLabel(account: SentinelUser): string {
    if (account.has_password) return 'Défini';
    if (account.has_password_setup_code) return 'Code temporaire actif';
    return 'À réinitialiser';
  }

  if (loading) {
    return (
      <>
        <NavBar />
        <main id="main-content">
          <FullPageLoader />
        </main>
      </>
    );
  }

  if (error || !user) {
    return (
      <>
        <NavBar />
        <main id="main-content" className="page-container">
          <button className="back-link" onClick={() => navigate('/admin/users')}>
            Retour à la liste
          </button>
          <ErrorBanner>{error || 'Utilisateur introuvable.'}</ErrorBanner>
        </main>
      </>
    );
  }

  return (
    <>
      <NavBar />
      <main id="main-content" className="page-container">
        <button className="back-link" onClick={() => navigate('/admin/users')}>
          Retour à la liste
        </button>

        <div className="page-header">
          <h1>
            {user.last_name} {user.first_name}
          </h1>
          <span
            className={`badge-status ${user.is_active ? 'active' : 'inactive'}`}
            style={{ fontSize: 14 }}
          >
            {user.is_active ? 'Actif' : 'Inactif'}
          </span>
        </div>

        {successMsg && <SuccessBanner style={{ marginBottom: 16 }}>{successMsg}</SuccessBanner>}

        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-body">
            <div className="detail-grid">
              <DetailField label="Nom">{user.last_name}</DetailField>
              <DetailField label="Prénom">{user.first_name}</DetailField>
              <DetailField label="Numéro de badge">{user.badge_number}</DetailField>
              <DetailField label="Rôle">
                <span className="badge-role">{formatRoleLabel(user.role)}</span>
              </DetailField>
              <DetailField label="Email">{user.email || '—'}</DetailField>
              <DetailField label="Mot de passe workshop">{passwordStatusLabel(user)}</DetailField>
              <DetailField label="Date de création">{formatDateTime(user.created_at)}</DetailField>
              <DetailField label="Dernière modification">
                {formatDateTime(user.updated_at)}
              </DetailField>
            </div>
          </div>
        </div>

        <div className="action-bar">
          <button className="btn btn-outline" onClick={() => setModal('edit')}>
            Modifier
          </button>
          <button className="btn btn-danger" onClick={() => setModal('delete')}>
            Supprimer
          </button>
        </div>
      </main>

      {modal === 'edit' && (
        <EditUserModal
          user={user}
          onClose={() => setModal(null)}
          onSuccess={(updated) => {
            setUser(updated);
            setModal(null);
            showSuccess('Utilisateur mis à jour avec succès.');
          }}
        />
      )}

      {modal === 'delete' && (
        <DeleteConfirmModal
          user={user}
          onClose={() => setModal(null)}
          onSuccess={() => {
            navigate('/admin/users', { replace: true });
          }}
        />
      )}
    </>
  );
}
