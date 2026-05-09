import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import NavBar from '../components/NavBar';
import EditUserModal from '../components/EditUserModal';
import DeleteConfirmModal from '../components/DeleteConfirmModal';
import { getAccount } from '../api/accounts';
import { SentinelUser } from '../types';

const ROLE_LABELS: Record<string, string> = {
  OPERATOR: 'Opérateur',
  MAINTENANCE: 'Maintenance',
  RESPONSABLE: 'Responsable',
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
        <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}>
          <span className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
        </div>
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
          <div className="error-message">{error || 'Utilisateur introuvable.'}</div>
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
              <div className="detail-field">
                <span className="detail-field-label">Nom</span>
                <span className="detail-field-value">{user.last_name}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Prénom</span>
                <span className="detail-field-value">{user.first_name}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Numéro de badge</span>
                <span className="detail-field-value">{user.badge_number}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Rôle</span>
                <span className="detail-field-value">
                  <span className="badge-role">{ROLE_LABELS[user.role] || user.role}</span>
                </span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Mot de passe workshop</span>
                <span className="detail-field-value">
                  {user.has_password ? 'Défini' : 'À définir'}
                </span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Date de création</span>
                <span className="detail-field-value">{formatDateTime(user.created_at)}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Dernière modification</span>
                <span className="detail-field-value">{formatDateTime(user.updated_at)}</span>
              </div>
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
