import ConfirmModal from './ConfirmModal';
import { WorkshopIncident } from '../types';

interface UnfollowIncidentConfirmModalProps {
  incident: WorkshopIncident;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export default function UnfollowIncidentConfirmModal({
  incident,
  onClose,
  onConfirm,
}: UnfollowIncidentConfirmModalProps) {
  const resolvedLabel = incident.status === 'CLOSED' ? 'clôturé' : 'annulé';

  return (
    <ConfirmModal
      title="Retirer du suivi"
      onClose={onClose}
      onConfirm={onConfirm}
      confirmLabel="Retirer du suivi"
      variant="danger"
    >
      <div className="notice">
        Vous allez retirer de vos suivis le cas {resolvedLabel} {incident.line_number} · {incident.machine_id}. Il disparaîtra de la vue Suivis.
      </div>
    </ConfirmModal>
  );
}
