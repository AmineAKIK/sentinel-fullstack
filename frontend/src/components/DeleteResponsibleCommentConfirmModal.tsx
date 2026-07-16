import ConfirmModal from './ConfirmModal';
import { WorkshopIncident } from '../types';

interface DeleteResponsibleCommentConfirmModalProps {
  incident: WorkshopIncident;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export default function DeleteResponsibleCommentConfirmModal({
  incident,
  onClose,
  onConfirm,
}: DeleteResponsibleCommentConfirmModalProps) {
  return (
    <ConfirmModal
      title="Retirer la consigne"
      onClose={onClose}
      onConfirm={onConfirm}
      confirmLabel="Retirer"
      variant="danger"
    >
      <div className="notice">
        Vous allez retirer la consigne responsable de l'incident {incident.line_number} ·{' '}
        {incident.machine_id}. Cette information ne sera plus visible sur la carte.
      </div>
    </ConfirmModal>
  );
}
