import { useState } from 'react';
import Modal from './Modal';
import { SentinelUser } from '../types';
import { activateAccount, deactivateAccount } from '../api/accounts';
import { ApiResponseError } from '../api/client';

interface ToggleActiveModalProps {
  user: SentinelUser;
  onClose: () => void;
  onSuccess: (user: SentinelUser) => void;
}

export default function ToggleActiveModal({ user, onClose, onSuccess }: ToggleActiveModalProps) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isDeactivating = user.is_active;

  async function handleConfirm() {
    setError('');
    setLoading(true);
    try {
      const updated = isDeactivating
        ? await deactivateAccount(user.id)
        : await activateAccount(user.id);
      onSuccess(updated);
    } catch (err) {
      if (err instanceof ApiResponseError) {
        setError(err.message);
      } else {
        setError('Une erreur inattendue est survenue.');
      }
      setLoading(false);
    }
  }

  return (
    <Modal
      title={isDeactivating ? "Désactiver l'utilisateur" : "Activer l'utilisateur"}
      onClose={loading ? undefined : onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>
            Annuler
          </button>
          <button
            className={isDeactivating ? 'btn btn-danger' : 'btn btn-primary'}
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? <><span className="spinner" /> …</> : 'Confirmer'}
          </button>
        </>
      }
    >
      <p style={{ fontWeight: 500, marginBottom: 8 }}>
        {isDeactivating ? 'Désactiver' : 'Activer'} {user.first_name} {user.last_name} ?
      </p>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
        {isDeactivating
          ? 'Cet utilisateur ne pourra plus se connecter à Sentinel. Son historique sera conservé.'
          : 'Cet utilisateur pourra de nouveau se connecter à Sentinel.'}
      </p>
      {error && <div className="error-message">{error}</div>}
    </Modal>
  );
}
