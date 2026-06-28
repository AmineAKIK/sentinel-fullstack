import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PasswordResetRequest, markPasswordResetRequestHandled } from '../api/admin';
import { formatElapsed } from '../utils/date';

interface PendingTasksWidgetProps {
  requests: PasswordResetRequest[];
  onHandled: (id: number) => void;
}

export default function PendingTasksWidget({ requests, onHandled }: PendingTasksWidgetProps) {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState<number | null>(null);
  const [loading, setLoading] = useState<number | null>(null);

  async function handleConfirm(id: number) {
    setLoading(id);
    try {
      await markPasswordResetRequestHandled(id);
      onHandled(id);
    } finally {
      setLoading(null);
      setConfirming(null);
    }
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
                  <div className="pending-task-meta">
                    <span className="pending-task-type">Réinitialisation mot de passe</span>
                    <small className="pending-task-time">il y a {formatElapsed(req.requested_at)}</small>
                  </div>
                  <span className="pending-task-user">
                    {req.last_name} {req.first_name}
                    <small>Badge {req.badge_number}</small>
                  </span>
                </button>

                <div className="pending-task-actions">
                  {confirming === req.id ? (
                    <>
                      <span className="pending-task-confirm-label">Confirmer ?</span>
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => handleConfirm(req.id)}
                        disabled={loading === req.id}
                      >
                        {loading === req.id ? 'En cours…' : 'Oui'}
                      </button>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => setConfirming(null)}
                        disabled={loading === req.id}
                      >
                        Non
                      </button>
                    </>
                  ) : (
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => setConfirming(req.id)}
                    >
                      Marquer traité
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
