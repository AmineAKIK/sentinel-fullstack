import ConfirmModal from './ConfirmModal';
import { WorkshopIncident } from '../types';

interface ResumeIncidentConfirmModalProps {
  incident: WorkshopIncident;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export default function ResumeIncidentConfirmModal({
  incident,
  onClose,
  onConfirm,
}: ResumeIncidentConfirmModalProps) {
  return (
    <ConfirmModal title="Confirmer la reprise" onClose={onClose} onConfirm={onConfirm}>
      <div className="notice">
        Vous allez remettre en cours l'incident {incident.line_number} · {incident.machine_id}.
        Cette action retire l'état en attente.
      </div>
    </ConfirmModal>
  );
}
