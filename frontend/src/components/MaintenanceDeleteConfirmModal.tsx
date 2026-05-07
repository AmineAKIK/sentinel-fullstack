import Modal from './Modal';
import { WorkshopIncident } from '../types';

interface MaintenanceDeleteConfirmModalProps {
  incident: WorkshopIncident;
  title: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export default function MaintenanceDeleteConfirmModal({
  incident,
  title,
  onClose,
  onConfirm,
}: MaintenanceDeleteConfirmModalProps) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      closeOnOverlay={false}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Annuler
          </button>
          <button className="btn btn-danger" onClick={onConfirm}>
            Confirmer
          </button>
        </>
      }
    >
      <div className="notice">
        Vous n'avez pas le droit de supprimer un signalement ou valider sa suppression sans prise en charge
        sauf erreur de signalement. Confirmez-vous cette action ?
      </div>
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
