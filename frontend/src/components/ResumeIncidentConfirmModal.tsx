import ConfirmModal from './ConfirmModal';
import { WorkshopIncident } from '../types';
import { WORKSHOP_MUTATION_KEYS } from '../utils/workshopMutationKeys';

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
    <ConfirmModal
      title="Confirmer la reprise"
      mutationKey={WORKSHOP_MUTATION_KEYS.RESUME}
      onClose={onClose}
      onConfirm={onConfirm}
    >
      <div className="notice">
        Vous allez remettre en cours l'incident {incident.line_number} · {incident.machine_id}.
        Cette action retire l'état en attente.
      </div>
    </ConfirmModal>
  );
}
