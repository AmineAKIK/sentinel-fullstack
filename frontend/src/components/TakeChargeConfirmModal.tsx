import Modal from './Modal';
import { WorkshopIncident } from '../types';

interface TakeChargeConfirmModalProps {
  incident: WorkshopIncident;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export default function TakeChargeConfirmModal({
  incident,
  onClose,
  onConfirm,
}: TakeChargeConfirmModalProps) {
  return (
    <Modal
      title="Confirmer la prise en charge"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Annuler
          </button>
          <button className="btn btn-primary" onClick={onConfirm}>
            Confirmer
          </button>
        </>
      }
    >
      <div className="notice">
        Vous allez prendre en charge l'incident {incident.line_number} · {incident.machine_id}.
      </div>
    </Modal>
  );
}
