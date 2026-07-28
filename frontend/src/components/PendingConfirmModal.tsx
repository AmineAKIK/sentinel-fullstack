import TextConfirmModal from './TextConfirmModal';
import { WorkshopIncident } from '../types';
import { FIELD_LIMITS } from '../utils/fieldLimits';
import { WORKSHOP_MUTATION_KEYS } from '../utils/workshopMutationKeys';

interface PendingConfirmModalProps {
  incident: WorkshopIncident;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}

export default function PendingConfirmModal({
  incident,
  onClose,
  onConfirm,
}: PendingConfirmModalProps) {
  return (
    <TextConfirmModal
      title="Suspendre l'incident"
      notice={
        <>
          Vous allez suspendre l'incident {incident.line_number} · {incident.machine_id}.
        </>
      }
      label="Motif de mise en attente *"
      placeholder="Expliquez la raison de la mise en attente"
      confirmLabel="Suspendre"
      loadingLabel="Confirmation…"
      mutationKey={WORKSHOP_MUTATION_KEYS.SET_PENDING}
      requiredMessage="Merci de renseigner le motif de mise en attente."
      failureMessage="Impossible de suspendre l'incident."
      textareaId="pendingReason"
      maxLength={FIELD_LIMITS.NOTE}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
