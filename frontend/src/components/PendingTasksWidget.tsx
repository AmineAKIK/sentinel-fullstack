import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PasswordResetRequest, markPasswordResetRequestHandled } from '../api/admin';
import { formatElapsed } from '../utils/date';
import ConfirmModal from './ConfirmModal';
import { useMutationRunner } from './ui/MutationFeedback';
import { apiErrorMessage } from '../api/errorMessages';

interface PendingTasksWidgetProps {
  requests: PasswordResetRequest[];
  onHandled: (id: number) => void;
}

export default function PendingTasksWidget({ requests, onHandled }: PendingTasksWidgetProps) {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState<PasswordResetRequest | null>(null);
  const mutation = useMutationRunner();
  const key = confirming ? `admin:reset-request:${confirming.id}:handled` : 'admin:reset-request';
  const loading = mutation.isPending(key);

  async function handleConfirm() {
    if (!confirming) return;
    const id = confirming.id;
    await mutation.execute(() => markPasswordResetRequestHandled(id), {
      key,
      successMessage: 'Demande marquée comme traitée.',
      toErrorMessage: (err) =>
        apiErrorMessage(err, 'Impossible de marquer cette demande comme traitée.'),
      onSuccess: () => {
        onHandled(id);
        setConfirming(null);
      },
    });
  }

  return (
    <section className="card admin-action-card">
      <div className="card-body">
        <div className="admin-section-header">
          <div>
            <h2>À traiter</h2>
            <span>Actions en attente de votre intervention</span>
          </div>
          {requests.length > 0 && (
            <strong className="admin-status-badge warning">{requests.length}</strong>
          )}
        </div>

        {requests.length === 0 ? (
          <div className="notice">Aucune action en attente.</div>
        ) : (
          <div className="quality-list">
            {requests.map((req) => (
              <div key={req.id} className="pending-task-item">
                <button
                  className="pending-task-body"
                  onClick={() => navigate(`/admin/users/${req.user_id}`)}
                >
                  <div className="pending-task-type">Réinitialisation mot de passe</div>
                  <div className="pending-task-user">
                    <strong>
                      {req.last_name} {req.first_name}
                    </strong>
                    <span>Badge {req.badge_number}</span>
                  </div>
                  <div className="pending-task-time">il y a {formatElapsed(req.requested_at)}</div>
                </button>

                <div className="pending-task-actions">
                  <button className="btn btn-sm btn-outline" onClick={() => setConfirming(req)}>
                    Marquer traité
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {confirming && (
        <ConfirmModal
          title="Marquer la demande comme traitée ?"
          onClose={() => setConfirming(null)}
          onConfirm={handleConfirm}
          confirmLabel="Marquer traité"
          loadingLabel="En cours…"
          loading={loading}
          mutationKey={key}
        >
          <p
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-secondary)',
              lineHeight: 1.6,
            }}
          >
            La demande de réinitialisation de{' '}
            <strong>
              {confirming.first_name} {confirming.last_name}
            </strong>{' '}
            (badge {confirming.badge_number}) sera retirée de la liste des actions à traiter.
            Assurez-vous d'avoir communiqué un nouveau code temporaire avant de confirmer.
          </p>
        </ConfirmModal>
      )}
    </section>
  );
}
