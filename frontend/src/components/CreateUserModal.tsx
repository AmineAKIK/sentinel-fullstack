import { useState } from 'react';
import Modal from './Modal';
import UserForm, { UserFormData } from './UserForm';
import { checkBadgeAvailability, createAccount } from '../api/accounts';
import { SentinelUser, Role } from '../types';
import { ApiResponseError } from '../api/client';
import { formatDateTime } from '../utils/date';

interface CreateUserModalProps {
  onClose: () => void;
  onSuccess: (user: SentinelUser) => void;
}

const EMPTY: UserFormData = { firstName: '', lastName: '', badgeNumber: '', role: '' };

export default function CreateUserModal({ onClose, onSuccess }: CreateUserModalProps) {
  const [form, setForm] = useState<UserFormData>(EMPTY);
  const [error, setError] = useState('');
  const [badgeError, setBadgeError] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'form' | 'preview' | 'created'>('form');
  const [createdUser, setCreatedUser] = useState<SentinelUser | null>(null);

  async function handlePreview() {
    setError('');
    setBadgeError('');

    const issues: string[] = [];

    if (!form.firstName.trim()) {
      issues.push('Le prénom est obligatoire.');
    } else if (form.firstName.trim().length < 2) {
      issues.push('Le prénom doit contenir au moins 2 caractères.');
    }

    if (!form.lastName.trim()) {
      issues.push('Le nom est obligatoire.');
    } else if (form.lastName.trim().length < 2) {
      issues.push('Le nom doit contenir au moins 2 caractères.');
    }

    if (!form.badgeNumber.trim()) {
      issues.push('Le numéro de badge est obligatoire.');
    } else if (form.badgeNumber.trim().length < 2) {
      issues.push('Le numéro de badge doit contenir au moins 2 caractères.');
    }

    if (!form.role) {
      issues.push('Veuillez sélectionner un rôle.');
    }

    if (issues.length > 1) {
      setError('Merci de compléter les champs obligatoires.');
      return;
    }
    if (issues.length === 1) {
      setError(issues[0]);
      return;
    }

    setLoading(true);
    try {
      const badgeCheck = await checkBadgeAvailability(form.badgeNumber.trim());
      if (badgeCheck.exists) {
        setBadgeError('Ce numéro de badge existe déjà.');
        return;
      }
      setStep('preview');
    } catch (err) {
      if (err instanceof ApiResponseError) {
        setError(err.message);
      } else {
        setError('Une erreur inattendue est survenue.');
      }
    } finally {
      setLoading(false);
    }
  }

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

  function handleBack() {
    setError('');
    setBadgeError('');
    setStep('form');
  }

  function handleClose() {
    if (createdUser) {
      onSuccess(createdUser);
      return;
    }
    onClose();
  }

  const isDirty = step === 'form' && (
    form.firstName.trim() !== '' ||
    form.lastName.trim() !== '' ||
    form.badgeNumber.trim() !== '' ||
    form.role !== ''
  );

  return (
    <Modal
      title={step === 'created' ? 'Code temporaire' : step === 'preview' ? 'Aperçu utilisateur' : 'Ajouter un utilisateur'}
      onClose={loading ? undefined : handleClose}
      closeOnOverlay={false}
      isDirty={isDirty}
      isLoading={loading}
      footer={
        step === 'created' ? (
          <button className="btn btn-primary" onClick={handleClose}>
            Fermer
          </button>
        ) : step === 'preview' ? (
          <>
            <button className="btn btn-secondary" onClick={handleBack} disabled={loading}>
              Retour
            </button>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
              {loading ? <><span className="spinner" /> Création…</> : 'Confirmer la création'}
            </button>
          </>
        ) : (
          <>
            <button className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Annuler
            </button>
            <button className="btn btn-primary" onClick={handlePreview} disabled={loading}>
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
            disabled={loading}
            badgeError={badgeError}
          />
          {error && <div className="error-message">{error}</div>}
        </>
      )}
      {error && step === 'preview' && <div className="error-message">{error}</div>}
    </Modal>
  );
}
