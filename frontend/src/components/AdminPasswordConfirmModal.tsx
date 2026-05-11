import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../routes/AuthContext';
import { verifyAdminPassword } from '../api/auth';
import { ApiResponseError } from '../api/client';
import ConfirmModal from './ConfirmModal';

type AdminPasswordConfirmModalProps = {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  disabled?: boolean;
  confirmLabel?: string;
  loadingLabel?: string;
};

export default function AdminPasswordConfirmModal({
  title,
  children,
  onClose,
  onConfirm,
  disabled = false,
  confirmLabel = 'Confirmer',
  loadingLabel = 'Suppression…',
}: AdminPasswordConfirmModalProps) {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [loading, setLoading] = useState(false);

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
      await onConfirm();
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
    <ConfirmModal
      title={title}
      onClose={onClose}
      onConfirm={handleConfirm}
      disabled={disabled}
      loading={loading}
      confirmLabel={confirmLabel}
      loadingLabel={loadingLabel}
      variant="danger"
      error={error}
    >
      {children}
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
    </ConfirmModal>
  );
}
