import { useState } from 'react';
import { verifyAdminPassword } from '../api/adminSecurity';
import { ApiResponseError } from '../api/client';
import ConfirmModal from './ConfirmModal';
import { isWithinBcryptByteLimit, MAX_PASSWORD_BYTES } from '../utils/passwordPolicy';

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
    if (!isWithinBcryptByteLimit(password)) {
      setPasswordError(`Le mot de passe ne peut pas dépasser ${MAX_PASSWORD_BYTES} octets UTF-8.`);
      return;
    }

    setLoading(true);
    try {
      await verifyAdminPassword(password);
      await onConfirm(password);
    } catch (err) {
      if (err instanceof ApiResponseError) {
        if (err.code === 'REAUTHENTICATION_FAILED') {
          setPasswordError('Mot de passe incorrect.');
        } else if (err.code === 'SESSION_REVOKED') {
          // Le gestionnaire global 401 redirige avec le motif structuré.
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
          maxLength={MAX_PASSWORD_BYTES}
        />
        {passwordError && <div className="field-error">{passwordError}</div>}
      </div>
    </ConfirmModal>
  );
}
