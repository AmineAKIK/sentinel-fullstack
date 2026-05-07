import { useState } from 'react';
import Modal from './Modal';
import UserForm, { UserFormData } from './UserForm';
import { checkBadgeAvailability, createAccount } from '../api/accounts';
import { SentinelUser, Role } from '../types';
import { ApiResponseError } from '../api/client';

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
  const [step, setStep] = useState<'form' | 'preview'>('form');

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
      onSuccess(user);
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

  return (
    <Modal
      title={step === 'preview' ? 'Aperçu utilisateur' : 'Ajouter un utilisateur'}
      onClose={loading ? undefined : onClose}
      closeOnOverlay={false}
      footer={
        step === 'preview' ? (
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
      {step === 'preview' ? (
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
