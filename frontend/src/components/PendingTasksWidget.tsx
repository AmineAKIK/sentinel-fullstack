import { useNavigate } from 'react-router-dom';
import { PasswordResetRequest, markPasswordResetRequestHandled } from '../api/admin';
import { formatElapsed } from '../utils/date';

interface PendingTasksWidgetProps {
  requests: PasswordResetRequest[];
  onHandled: (id: number) => void;
}

export default function PendingTasksWidget({ requests, onHandled }: PendingTasksWidgetProps) {
  const navigate = useNavigate();

  async function handleMark(e: React.MouseEvent, id: number) {
    e.stopPropagation();
    await markPasswordResetRequestHandled(id);
    onHandled(id);
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
          <div className="admin-action-list">
            {requests.map((req) => (
              <div key={req.id} className="admin-action-row admin-task-row">
                <button
                  className="admin-task-main"
                  onClick={() => navigate(`/admin/users/${req.user_id}`)}
                >
                  <span className="admin-task-label">
                    Réinitialisation mot de passe
                  </span>
                  <span className="admin-task-user">
                    {req.last_name} {req.first_name}
                    <small>Badge {req.badge_number}</small>
                  </span>
                  <small className="admin-task-time">
                    il y a {formatElapsed(req.requested_at)}
                  </small>
                </button>
                <button
                  className="btn btn-outline admin-task-done"
                  onClick={(e) => handleMark(e, req.id)}
                  title="Marquer comme traité"
                >
                  Traité
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
