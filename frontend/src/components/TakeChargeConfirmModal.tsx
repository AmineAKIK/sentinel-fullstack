import ConfirmModal from './ConfirmModal';
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
    <ConfirmModal title="Confirmer la prise en charge" onClose={onClose} onConfirm={onConfirm}>
      <div className="notice">
        Vous allez prendre en charge l'incident {incident.line_number} · {incident.machine_id}.
      </div>
    </ConfirmModal>
  );
}
