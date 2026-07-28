import Modal from './Modal';
import { UserFormData } from './UserForm';
import { SentinelUser } from '../types';
import { activateAccount, deactivateAccount, updateAccount } from '../api/accounts';
import { apiErrorMessage } from '../api/errorMessages';
import { formatRoleLabel } from '../utils/labels';
import { useMutationRunner } from './ui/MutationFeedback';

interface EditSummaryModalProps {
  user: SentinelUser;
  form: UserFormData;
  onBack: () => void;
  onClose: () => void;
  onSuccess: (user: SentinelUser) => void;
}

const FIELD_LABELS: Record<string, string> = {
  firstName: 'Prénom',
  lastName: 'Nom',
  badgeNumber: 'Numéro de badge',
  role: 'Rôle',
  email: 'Email',
  isActive: 'Statut',
};

function roleLabel(val: string): string {
  return formatRoleLabel(val);
}

export default function EditSummaryModal({
  user,
  form,
  onBack,
  onClose,
  onSuccess,
}: EditSummaryModalProps) {
  const mutation = useMutationRunner();
  const key = `admin:user:${user.id}:update`;
  const loading = mutation.isPending(key);

  const changes: { field: string; label: string; oldVal: string; newVal: string }[] = [];

  if (form.firstName.trim() !== user.first_name) {
    changes.push({
      field: 'firstName',
      label: FIELD_LABELS.firstName,
      oldVal: user.first_name,
      newVal: form.firstName.trim(),
    });
  }
  if (form.lastName.trim() !== user.last_name) {
    changes.push({
      field: 'lastName',
      label: FIELD_LABELS.lastName,
      oldVal: user.last_name,
      newVal: form.lastName.trim(),
    });
  }
  if (form.badgeNumber.trim() !== user.badge_number) {
    changes.push({
      field: 'badgeNumber',
      label: FIELD_LABELS.badgeNumber,
      oldVal: user.badge_number,
      newVal: form.badgeNumber.trim(),
    });
  }
  if (form.role !== user.role) {
    changes.push({
      field: 'role',
      label: FIELD_LABELS.role,
      oldVal: roleLabel(user.role),
      newVal: roleLabel(form.role),
    });
  }
  const formEmail = form.email?.trim() || null;
  const userEmail = user.email || null;
  if (formEmail !== userEmail) {
    changes.push({
      field: 'email',
      label: FIELD_LABELS.email,
      oldVal: userEmail ?? '—',
      newVal: formEmail ?? '—',
    });
  }
  if (form.isActive !== undefined && form.isActive !== user.is_active) {
    changes.push({
      field: 'isActive',
      label: FIELD_LABELS.isActive,
      oldVal: user.is_active ? 'Actif' : 'Inactif',
      newVal: form.isActive ? 'Actif' : 'Inactif',
    });
  }

  const statusChange = form.isActive !== undefined && form.isActive !== user.is_active;

  async function handleSave() {
    const payload: Record<string, string | null> = {};
    if (form.firstName.trim() !== user.first_name) payload.firstName = form.firstName.trim();
    if (form.lastName.trim() !== user.last_name) payload.lastName = form.lastName.trim();
    if (form.badgeNumber.trim() !== user.badge_number)
      payload.badgeNumber = form.badgeNumber.trim();
    if (form.role !== user.role) payload.role = form.role;
    if (formEmail !== userEmail) payload.email = formEmail;

    await mutation.execute(
      async () => {
        let updated = user;
        if (Object.keys(payload).length > 0) {
          updated = await updateAccount(user.id, payload);
        }
        if (statusChange) {
          updated = form.isActive
            ? await activateAccount(user.id)
            : await deactivateAccount(user.id);
        }
        return updated;
      },
      {
        key,
        successMessage:
          statusChange && form.isActive
            ? 'Compte activé.'
            : statusChange
              ? 'Compte désactivé.'
              : 'Utilisateur mis à jour.',
        toErrorMessage: (err) => apiErrorMessage(err, 'Une erreur inattendue est survenue.'),
        onSuccess,
      }
    );
  }

  return (
    <Modal
      title="Récapitulatif des modifications"
      onClose={loading ? undefined : onClose}
      closeOnOverlay={false}
      isLoading={loading}
      size="lg"
      footer={
        <>
          <button className="btn btn-secondary" onClick={onBack} disabled={loading}>
            Retour
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={loading || changes.length === 0}
          >
            {loading ? (
              <>
                <span className="spinner" aria-hidden="true" /> Enregistrement…
              </>
            ) : (
              'Enregistrer'
            )}
          </button>
        </>
      }
    >
      {changes.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>
          Aucune modification détectée.
        </p>
      ) : (
        <div className="table-wrapper">
          <table className="change-table">
            <thead>
              <tr>
                <th scope="col">Champ</th>
                <th scope="col">Ancienne valeur</th>
                <th scope="col">Nouvelle valeur</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((c) => (
                <tr key={c.field}>
                  <td>
                    <strong>{c.label}</strong>
                  </td>
                  <td>
                    <span className="val-old">{c.oldVal}</span>
                  </td>
                  <td>
                    <span className="val-new">{c.newVal}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {statusChange && !form.isActive ? (
        <div className="notice notice--danger">
          La désactivation déconnectera cet utilisateur et empêchera ses prochaines connexions.
          Confirmez uniquement après avoir vérifié ses incidents en cours.
        </div>
      ) : null}
    </Modal>
  );
}
