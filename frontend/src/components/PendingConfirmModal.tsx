import TextConfirmModal from './TextConfirmModal';
import { WorkshopIncident } from '../types';

interface PendingConfirmModalProps {
  incident: WorkshopIncident;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}

export default function PendingConfirmModal({ incident, onClose, onConfirm }: PendingConfirmModalProps) {
  return (
    <TextConfirmModal
      title="Mettre en attente"
      notice={<>Vous allez mettre en attente l'incident {incident.line_number} · {incident.machine_id}.</>}
      label="Justification *"
      placeholder="Expliquez la raison de la mise en attente"
      confirmLabel="Mettre en attente"
      loadingLabel="Confirmation…"
      requiredMessage="Merci de renseigner la justification."
      failureMessage="Impossible de mettre l'incident en attente."
      textareaId="pendingReason"
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
