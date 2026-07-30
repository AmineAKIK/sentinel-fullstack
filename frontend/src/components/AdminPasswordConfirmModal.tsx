import { useEffect, useRef, useState } from 'react';
import { verifyAdminPassword } from '../api/adminSecurity';
import { ApiResponseError } from '../api/client';
import { apiErrorMessage } from '../api/errorMessages';
import ConfirmModal from './ConfirmModal';
import { isWithinBcryptByteLimit, MAX_PASSWORD_BYTES } from '../utils/passwordPolicy';
import { useMutationRunner } from './ui/MutationFeedback';

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
  mutationKey: string;
  successMessage: string;
  failureMessage?: string;
};

export default function AdminPasswordConfirmModal({
  title,
  children,
  onClose,
  onConfirm,
  disabled = false,
  confirmLabel = 'Confirmer',
  loadingLabel = 'Suppression…',
  mutationKey,
  successMessage,
  failureMessage = 'Une erreur est survenue.',
}: AdminPasswordConfirmModalProps) {
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const mutation = useMutationRunner();
  const loading = mutation.isPending(mutationKey);

  useEffect(() => {
    if (!loading && passwordError) {
      passwordInputRef.current?.focus({ preventScroll: true });
    }
  }, [loading, passwordError]);

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

    await mutation.execute(
      async () => {
        await verifyAdminPassword(password);
        await onConfirm(password);
      },
      {
        key: mutationKey,
        successMessage,
        errorPresentation: 'local',
        toErrorMessage: (err) => apiErrorMessage(err, failureMessage),
        onError: (err, safeMessage) => {
          if (err instanceof ApiResponseError && err.code === 'REAUTHENTICATION_FAILED') {
            setPasswordError('Mot de passe incorrect.');
          } else if (err instanceof ApiResponseError && err.code === 'SESSION_REVOKED') {
            // Le gestionnaire global 401 redirige avec le motif structuré.
          } else {
            setError(safeMessage);
          }
        },
      }
    );
  }

  return (
    <ConfirmModal
      title={title}
      onClose={onClose}
      onConfirm={handleConfirm}
      disabled={disabled}
      loading={loading}
      mutationKey={mutationKey}
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
          ref={passwordInputRef}
          id="adminPassword"
          className="form-input"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={loading}
          autoComplete="current-password"
          maxLength={MAX_PASSWORD_BYTES}
          aria-invalid={passwordError ? true : undefined}
          aria-describedby={passwordError ? 'admin-password-error' : undefined}
        />
        {passwordError && (
          <div id="admin-password-error" className="field-error" role="alert">
            {passwordError}
          </div>
        )}
      </div>
    </ConfirmModal>
  );
}
