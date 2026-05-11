import { useState } from 'react';
import ConfirmModal from './ConfirmModal';
import { resetAccountPassword } from '../api/accounts';
import { ApiResponseError } from '../api/client';
import { SentinelUser } from '../types';

interface ResetPasswordConfirmModalProps {
  user: SentinelUser;
  onClose: () => void;
  onSuccess: (user: SentinelUser) => void;
}

export default function ResetPasswordConfirmModal({
  user,
  onClose,
  onSuccess,
}: ResetPasswordConfirmModalProps) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setError('');
    setLoading(true);
    try {
      const updated = await resetAccountPassword(user.id);
      onSuccess(updated);
    } catch (err) {
      setError(err instanceof ApiResponseError ? err.message : 'Une erreur inattendue est survenue.');
      setLoading(false);
    }
  }

  return (
    <ConfirmModal
      title="Réinitialiser le mot de passe"
      onClose={onClose}
      closeOnOverlay={!user.has_password}
      variant={user.has_password ? 'danger' : 'default'}
      onConfirm={user.has_password ? handleConfirm : undefined}
      loading={loading}
      loadingLabel="Réinitialisation…"
      error={error}
    >
      {user.has_password ? (
        <>
          <p style={{ fontWeight: 500, marginBottom: 8 }}>
            Réinitialiser le mot de passe de {user.first_name} {user.last_name} ?
          </p>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
            L'utilisateur devra se reconnecter avec son badge puis choisir un nouveau mot de passe.
          </p>
        </>
      ) : (
        <div className="success-message">
          Aucun mot de passe n'est défini pour cet utilisateur.
        </div>
      )}
    </ConfirmModal>
  );
}
