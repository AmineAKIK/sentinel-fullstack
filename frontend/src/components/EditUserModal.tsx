import { useState } from 'react';
import Modal from './Modal';
import UserForm, { UserFormData } from './UserForm';
import EditSummaryModal from './EditSummaryModal';
import ResetPasswordConfirmModal from './ResetPasswordConfirmModal';
import { SentinelUser } from '../types';

interface EditUserModalProps {
  user: SentinelUser;
  onClose: () => void;
  onSuccess: (user: SentinelUser) => void;
}

function userToForm(user: SentinelUser): UserFormData {
  return {
    firstName: user.first_name,
    lastName: user.last_name,
    badgeNumber: user.badge_number,
    role: user.role,
    isActive: user.is_active,
  };
}

export default function EditUserModal({ user, onClose, onSuccess }: EditUserModalProps) {
  const [form, setForm] = useState<UserFormData>(userToForm(user));
  const [error, setError] = useState('');
  const [showSummary, setShowSummary] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const isDirty =
    form.firstName.trim() !== user.first_name ||
    form.lastName.trim() !== user.last_name ||
    form.badgeNumber.trim() !== user.badge_number ||
    form.role !== user.role ||
    form.isActive !== user.is_active;

  function handleConfirm() {
    setError('');

    const noChanges =
      form.firstName.trim() === user.first_name &&
      form.lastName.trim() === user.last_name &&
      form.badgeNumber.trim() === user.badge_number &&
      form.role === user.role &&
      form.isActive === user.is_active;
    if (noChanges) {
      onClose();
      return;
    }

    if (!form.firstName.trim() || form.firstName.trim().length < 2) {
      setError('Le prénom doit contenir au moins 2 caractères.');
      return;
    }
    if (!form.lastName.trim() || form.lastName.trim().length < 2) {
      setError('Le nom doit contenir au moins 2 caractères.');
      return;
    }
    if (!form.badgeNumber.trim() || form.badgeNumber.trim().length < 2) {
      setError('Le numéro de badge doit contenir au moins 2 caractères.');
      return;
    }
    if (!form.role) {
      setError('Veuillez sélectionner un rôle.');
      return;
    }

    setShowSummary(true);
  }

  if (showSummary) {
    return (
      <EditSummaryModal
        user={user}
        form={form}
        onBack={() => setShowSummary(false)}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );
  }

  return (
    <>
      <Modal
        title="Modifier l'utilisateur"
        onClose={onClose}
        closeOnOverlay={false}
        isDirty={isDirty}
        footer={
          <>
            <button className="btn btn-secondary" onClick={onClose}>
              Annuler
            </button>
            <button className="btn btn-primary" onClick={handleConfirm}>
              Confirmer
            </button>
          </>
        }
      >
        <UserForm data={form} onChange={setForm} showStatus />
        <div className="modal-inline-actions">
          <button className="btn btn-secondary" onClick={() => setShowResetPassword(true)}>
            Réinitialiser mot de passe
          </button>
        </div>
        {error && <div className="error-message">{error}</div>}
      </Modal>

      {showResetPassword && (
        <ResetPasswordConfirmModal
          user={user}
          onClose={() => setShowResetPassword(false)}
          onSuccess={(updated) => {
            onSuccess(updated);
            setShowResetPassword(false);
          }}
        />
      )}
    </>
  );
}
