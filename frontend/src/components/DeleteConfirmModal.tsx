import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../routes/AuthContext';
import Modal from './Modal';
import { SentinelUser } from '../types';
import { deleteAccount, getAccountImpact } from '../api/accounts';
import { verifyAdminPassword } from '../api/auth';
import { ApiResponseError } from '../api/client';

interface DeleteConfirmModalProps {
  user: SentinelUser;
  onClose: () => void;
  onSuccess: () => void;
}

export default function DeleteConfirmModal({ user, onClose, onSuccess }: DeleteConfirmModalProps) {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [loading, setLoading] = useState(false);
  const [impact, setImpact] = useState<{ reported_incidents: number; taken_incidents: number } | null>(null);

  useEffect(() => {
    getAccountImpact(user.id).then(setImpact).catch(() => setImpact(null));
  }, [user.id]);

  async function handleConfirm() {
    setError('');
    setPasswordError('');

    if (!password.trim()) {
      setPasswordError('Mot de passe administrateur requis.');
      return;
    }

    setLoading(true);
    try {
      await verifyAdminPassword(password);
      await deleteAccount(user.id);
      onSuccess();
    } catch (err) {
      if (err instanceof ApiResponseError) {
        if (err.code === 'UNAUTHORIZED') {
          if (err.message === 'Session expirée.') {
            await logout();
            navigate('/admin/login', {
              replace: true,
              state: { reason: 'Session expirée après 3 tentatives de mot de passe incorrect.' },
            });
            return;
          }
          setPasswordError('Mot de passe incorrect.');
        } else {
          setError(err.message);
        }
      } else {
        setError('Une erreur inattendue est survenue.');
      }
      setLoading(false);
    }
  }

  return (
    <Modal
      title="Supprimer l'utilisateur"
      onClose={loading ? undefined : onClose}
      closeOnOverlay={false}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>
            Annuler
          </button>
          <button className="btn btn-danger" onClick={handleConfirm} disabled={loading}>
            {loading ? <><span className="spinner" /> Suppression…</> : 'Confirmer'}
          </button>
        </>
      }
    >
      <p style={{ fontWeight: 500, marginBottom: 8 }}>
        Supprimer {user.first_name} {user.last_name} ?
      </p>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
        Cette action retirera l'utilisateur de la gestion courante. Les actions déjà réalisées par
        cet utilisateur resteront conservées dans l'historique.
      </p>
      {impact && (impact.reported_incidents > 0 || impact.taken_incidents > 0) && (
        <div className="notice">
          Impact historique : {impact.reported_incidents} incident(s) signalé(s), {impact.taken_incidents} incident(s) pris en charge.
        </div>
      )}
      <div className="form-group" style={{ marginTop: 16 }}>
        <label className="form-label" htmlFor="adminPassword">Mot de passe administrateur</label>
        <input
          id="adminPassword"
          className="form-input"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={loading}
          autoComplete="current-password"
        />
        {passwordError && <div className="field-error">{passwordError}</div>}
      </div>
      {error && <div className="error-message">{error}</div>}
    </Modal>
  );
}
