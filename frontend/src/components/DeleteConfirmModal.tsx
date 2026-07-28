import { useEffect, useState } from 'react';
import AdminPasswordConfirmModal from './AdminPasswordConfirmModal';
import { SentinelUser } from '../types';
import { deleteAccount, getAccountImpact } from '../api/accounts';
import { useMutationRunner } from './ui/MutationFeedback';

interface DeleteConfirmModalProps {
  user: SentinelUser;
  onClose: () => void;
  onSuccess: () => void;
}

export default function DeleteConfirmModal({ user, onClose, onSuccess }: DeleteConfirmModalProps) {
  useMutationRunner();
  const [impact, setImpact] = useState<{
    reported_incidents: number;
    taken_incidents: number;
    active_taken_incidents: number;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void getAccountImpact(user.id, controller.signal)
      .then(setImpact)
      .catch(() => {
        if (!controller.signal.aborted) setImpact(null);
      });
    return () => controller.abort();
  }, [user.id]);

  const hasActiveTakenIncidents = Boolean(impact && impact.active_taken_incidents > 0);

  async function handleConfirm() {
    await deleteAccount(user.id);
    onSuccess();
  }

  return (
    <AdminPasswordConfirmModal
      title="Supprimer l'utilisateur"
      onClose={onClose}
      onConfirm={handleConfirm}
      disabled={hasActiveTakenIncidents}
      mutationKey={`admin:user:${user.id}:delete`}
      successMessage="Utilisateur supprimé."
      failureMessage="Impossible de supprimer l’utilisateur."
    >
      <p style={{ fontWeight: 500, marginBottom: 8 }}>
        Supprimer {user.first_name} {user.last_name} ?
      </p>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
        Cette action retirera l'utilisateur de la gestion courante. Les actions déjà réalisées par
        cet utilisateur resteront conservées dans l'historique.
      </p>
      {impact && (impact.reported_incidents > 0 || impact.taken_incidents > 0) && (
        <div className="notice">
          Impact historique : {impact.reported_incidents} incident(s) signalé(s),{' '}
          {impact.taken_incidents} incident(s) pris en charge.
          {hasActiveTakenIncidents && (
            <>
              {' '}
              Suppression bloquée tant que {impact.active_taken_incidents} incident(s) actif(s)
              restent pris en charge.
            </>
          )}
        </div>
      )}
    </AdminPasswordConfirmModal>
  );
}
