import { useState } from 'react';
import ConfirmModal from './ConfirmModal';
import SuccessBanner from './ui/SuccessBanner';
import { resetAccountPassword } from '../api/accounts';
import { apiErrorMessage } from '../api/errorMessages';
import { SentinelUser } from '../types';
import { formatDateTime } from '../utils/date';

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
  const [updatedUser, setUpdatedUser] = useState<SentinelUser | null>(null);

  async function handleConfirm() {
    setError('');
    setLoading(true);
    try {
      const updated = await resetAccountPassword(user.id);
      setUpdatedUser(updated);
    } catch (err) {
      setError(apiErrorMessage(err, 'Une erreur inattendue est survenue.'));
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    if (updatedUser) {
      onSuccess(updatedUser);
      return;
    }
    onClose();
  }

  const hasPasswordOrSetupCode = user.has_password || user.has_password_setup_code;

  return (
    <ConfirmModal
      title={updatedUser ? 'Code temporaire' : 'Réinitialiser le mot de passe'}
      onClose={handleClose}
      closeOnOverlay={false}
      variant={hasPasswordOrSetupCode && !updatedUser ? 'danger' : 'default'}
      onConfirm={updatedUser ? undefined : handleConfirm}
      confirmLabel={hasPasswordOrSetupCode ? 'Réinitialiser' : 'Générer un code'}
      cancelLabel={updatedUser ? 'Fermer' : 'Annuler'}
      loading={loading}
      loadingLabel="Réinitialisation…"
      error={error}
    >
      {updatedUser ? (
        <div>
          <SuccessBanner style={{ marginBottom: 16 }}>
            Code temporaire généré pour {updatedUser.first_name} {updatedUser.last_name}.
          </SuccessBanner>
          <div className="detail-field" style={{ marginBottom: 14 }}>
            <span className="detail-field-label">Code temporaire</span>
            <span
              className="detail-field-value"
              style={{ fontSize: 24, letterSpacing: 1, fontWeight: 700 }}
            >
              {updatedUser.password_setup_code}
            </span>
          </div>
          <div className="notice">
            Ce code est affiché une seule fois. Il expire le{' '}
            {updatedUser.password_setup_expires_at
              ? formatDateTime(updatedUser.password_setup_expires_at)
              : 'prochainement'}
            .
          </div>
        </div>
      ) : (
        <>
          <p style={{ fontWeight: 500, marginBottom: 8 }}>
            Générer un code temporaire pour {user.first_name} {user.last_name} ?
          </p>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
            {hasPasswordOrSetupCode
              ? "Le mot de passe actuel ou l'ancien code temporaire sera invalidé. L'utilisateur devra se connecter avec son badge, le nouveau code temporaire puis choisir son mot de passe."
              : "L'utilisateur devra se connecter avec son badge, ce code temporaire puis choisir son mot de passe."}
          </p>
        </>
      )}
    </ConfirmModal>
  );
}
