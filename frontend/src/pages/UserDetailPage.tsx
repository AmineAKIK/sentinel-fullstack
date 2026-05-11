import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import NavBar from '../components/NavBar';
import EditUserModal from '../components/EditUserModal';
import DeleteConfirmModal from '../components/DeleteConfirmModal';
import DetailField from '../components/ui/DetailField';
import ErrorBanner from '../components/ui/ErrorBanner';
import FullPageLoader from '../components/ui/FullPageLoader';
import { getAccount } from '../api/accounts';
import { SentinelUser } from '../types';
import { formatDateTime } from '../utils/date';

const ROLE_LABELS: Record<string, string> = {
  OPERATOR: 'Opérateur',
  MAINTENANCE: 'Maintenance',
  RESPONSABLE: 'Responsable',
};

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<SentinelUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [modal, setModal] = useState<'edit' | 'delete' | null>(null);

  useEffect(() => {
    const numId = parseInt(id || '', 10);
    if (isNaN(numId)) {
      navigate('/admin/users', { replace: true });
      return;
    }

    setLoading(true);
    getAccount(numId)
      .then(setUser)
      .catch(() => {
        setError("Utilisateur introuvable ou accès refusé.");
      })
      .finally(() => setLoading(false));
  }, [id, navigate]);

  function showSuccess(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 4000);
  }

  if (loading) {
    return (
      <>
        <NavBar />
        <FullPageLoader />
      </>
    );
  }

  if (error || !user) {
    return (
      <>
        <NavBar />
        <div className="page-container">
          <button className="back-link" onClick={() => navigate('/admin/users')}>
            Retour à la liste
          </button>
          <ErrorBanner>{error || 'Utilisateur introuvable.'}</ErrorBanner>
        </div>
      </>
    );
  }

  return (
    <>
      <NavBar />
      <div className="page-container">
        <button className="back-link" onClick={() => navigate('/admin/users')}>
          Retour à la liste
        </button>

        <div className="page-header">
          <h1>
            {user.last_name} {user.first_name}
          </h1>
          <span className={`badge-status ${user.is_active ? 'active' : 'inactive'}`} style={{ fontSize: 14 }}>
            {user.is_active ? 'Actif' : 'Inactif'}
          </span>
        </div>

        {successMsg && (
          <div className="success-message" style={{ marginBottom: 16 }}>
            {successMsg}
          </div>
        )}

        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-body">
            <div className="detail-grid">
              <DetailField label="Nom">{user.last_name}</DetailField>
              <DetailField label="Prénom">{user.first_name}</DetailField>
              <DetailField label="Numéro de badge">{user.badge_number}</DetailField>
              <DetailField label="Rôle">
                <span className="badge-role">{ROLE_LABELS[user.role] || user.role}</span>
              </DetailField>
              <DetailField label="Mot de passe workshop">
                {user.has_password ? 'Défini' : 'À définir'}
              </DetailField>
              <DetailField label="Date de création">{formatDateTime(user.created_at)}</DetailField>
              <DetailField label="Dernière modification">{formatDateTime(user.updated_at)}</DetailField>
            </div>
          </div>
        </div>

        <div className="action-bar">
          <button className="btn btn-secondary" onClick={() => setModal('edit')}>
            Modifier
          </button>
          <button className="btn btn-danger" onClick={() => setModal('delete')}>
            Supprimer
          </button>
        </div>
      </div>

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
