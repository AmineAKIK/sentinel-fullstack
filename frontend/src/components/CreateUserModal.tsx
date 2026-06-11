import { useState } from 'react';
import Modal from './Modal';
import UserForm from './UserForm';
import { createAccount } from '../api/accounts';
import { SentinelUser, Role } from '../types';
import { ApiResponseError } from '../api/client';
import { formatDateTime } from '../utils/date';
import { useUserForm } from '../hooks/useUserForm';

interface CreateUserModalProps {
  onClose: () => void;
  onSuccess: (user: SentinelUser) => void;
}

export default function CreateUserModal({ onClose, onSuccess }: CreateUserModalProps) {
  const { form, setForm, error: formError, badgeError, setBadgeError, loading: formLoading, step, setStep, handlePreview, handleBack, isDirty } = useUserForm();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [createdUser, setCreatedUser] = useState<SentinelUser | null>(null);

  const displayError = error || formError;
  const isLoading = loading || formLoading;

  async function handleSubmit() {
    setError('');
    setBadgeError('');

    setLoading(true);
    try {
      const user = await createAccount({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        badgeNumber: form.badgeNumber.trim(),
        role: form.role as Role,
      });
      setCreatedUser(user);
      setStep('created');
    } catch (err) {
      if (err instanceof ApiResponseError) {
        if (err.code === 'BADGE_ALREADY_EXISTS') {
          setBadgeError('Ce numéro de badge existe déjà.');
          return;
        }
        setError(err.message);
      } else {
        setError('Une erreur inattendue est survenue.');
      }
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    if (createdUser) {
      onSuccess(createdUser);
      return;
    }
    onClose();
  }

  return (
    <Modal
      title={step === 'created' ? 'Code temporaire' : step === 'preview' ? 'Aperçu utilisateur' : 'Ajouter un utilisateur'}
      onClose={isLoading ? undefined : handleClose}
      closeOnOverlay={false}
      isDirty={isDirty}
      isLoading={isLoading}
      footer={
        step === 'created' ? (
          <button className="btn btn-primary" onClick={handleClose}>
            Fermer
          </button>
        ) : step === 'preview' ? (
          <>
            <button className="btn btn-secondary" onClick={handleBack} disabled={isLoading}>
              Retour
            </button>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={isLoading}>
              {isLoading ? <><span className="spinner" aria-hidden="true" /> Création…</> : 'Confirmer la création'}
            </button>
          </>
        ) : (
          <>
            <button className="btn btn-secondary" onClick={onClose} disabled={isLoading}>
              Annuler
            </button>
            <button className="btn btn-primary" onClick={() => void handlePreview()} disabled={isLoading}>
              Aperçu
            </button>
          </>
        )
      }
    >
      {step === 'created' && createdUser ? (
        <div>
          <div className="success-message" style={{ marginBottom: 16 }}>
            Utilisateur créé. Communiquez ce code temporaire à {createdUser.first_name} {createdUser.last_name}.
          </div>
          <div className="detail-field" style={{ marginBottom: 14 }}>
            <span className="detail-field-label">Code temporaire</span>
            <span className="detail-field-value" style={{ fontSize: 24, letterSpacing: 1, fontWeight: 700 }}>
              {createdUser.password_setup_code}
            </span>
          </div>
          <div className="notice">
            Ce code est affiché une seule fois. Il expire le {createdUser.password_setup_expires_at ? formatDateTime(createdUser.password_setup_expires_at) : 'prochainement'}.
          </div>
        </div>
      ) : step === 'preview' ? (
        <div className="detail-grid">
          <div>
            <div className="detail-field">
              <span className="detail-field-label">Nom</span>
              <span className="detail-field-value">{form.lastName}</span>
            </div>
            <div className="detail-field">
              <span className="detail-field-label">Prénom</span>
              <span className="detail-field-value">{form.firstName}</span>
            </div>
          </div>
          <div>
            <div className="detail-field">
              <span className="detail-field-label">Badge</span>
              <span className="detail-field-value">{form.badgeNumber}</span>
            </div>
            <div className="detail-field">
              <span className="detail-field-label">Rôle</span>
              <span className="detail-field-value">{form.role || '-'}</span>
            </div>
          </div>
        </div>
      ) : (
        <>
          <UserForm
            data={form}
            onChange={(next) => {
              if (next.badgeNumber !== form.badgeNumber) setBadgeError('');
              setForm(next);
            }}
            disabled={isLoading}
            badgeError={badgeError}
          />
          {displayError && <div id="create-user-error" className="error-message" role="alert">{displayError}</div>}
        </>
      )}
      {displayError && step === 'preview' && <div id="create-user-error-preview" className="error-message" role="alert">{displayError}</div>}
    </Modal>
  );
}
