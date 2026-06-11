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
      title="Suspendre l'incident"
      notice={<>Vous allez suspendre l'incident {incident.line_number} · {incident.machine_id}.</>}
      label="Justification *"
      placeholder="Expliquez la raison de la suspension"
      confirmLabel="Suspendre"
      loadingLabel="Confirmation…"
      requiredMessage="Merci de renseigner la justification."
      failureMessage="Impossible de suspendre l'incident."
      textareaId="pendingReason"
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
