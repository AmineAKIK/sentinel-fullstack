import Modal from './Modal';
import { WorkshopIncident } from '../types';

interface MaintenanceDeleteConfirmModalProps {
  incident: WorkshopIncident;
  title: string;
  message?: string;
  error?: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export default function MaintenanceDeleteConfirmModal({
  incident,
  title,
  message,
  error = '',
  onClose,
  onConfirm,
}: MaintenanceDeleteConfirmModalProps) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      closeOnOverlay={false}
      variant="danger"
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Annuler
          </button>
          <button className="btn btn-danger" onClick={onConfirm}>
            Confirmer l’annulation
          </button>
        </>
      }
    >
      <div className="notice">
        {message || "Cette action annule l’incident et le conserve dans l’historique. Confirmez uniquement s’il s’agit d’une erreur ou d’un doublon."}
      </div>
      {error && <div className="error-message" role="alert">{error}</div>}
      <div className="detail-grid" style={{ marginTop: 12 }}>
        <div className="detail-field">
          <span className="detail-field-label">Incident</span>
          <span className="detail-field-value">
            {incident.line_number} · {incident.machine_id}
          </span>
        </div>
      </div>
    </Modal>
  );
}
