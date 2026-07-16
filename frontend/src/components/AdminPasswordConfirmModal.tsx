import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppAuth } from '../routes/AppAuthContext';
import { verifyAdminPassword } from '../api/adminSecurity';
import { ApiResponseError } from '../api/client';
import ConfirmModal from './ConfirmModal';

type AdminPasswordConfirmModalProps = {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  // Reçoit le mot de passe vérifié : les mutations critiques le retransmettent
  // à leur API, qui le revérifie elle-même (defense in depth).
  onConfirm: (password: string) => Promise<void>;
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
  const { logout } = useAppAuth();
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
      await onConfirm(password);
    } catch (err) {
      if (err instanceof ApiResponseError) {
        if (err.code === 'UNAUTHORIZED') {
          if (err.message.includes('Session expirée')) {
            await logout();
            navigate('/login', {
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
        <label className="form-label" htmlFor="adminPassword">
          Mot de passe administrateur
        </label>
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
